# 商品颜色图片审核迁移修复 - 完整实施计划

## 一、问题诊断总结

### 1.1 当前架构状态

```
卖家上传商品
    ├── 主图 → Supabase Storage ✓
    ├── 颜色图片 → Supabase Storage ✓
    └── 提交审核

管理员审核流程 (approve/route.ts)
    ├── 检查商品图片是否为 Supabase URL ✓
    ├── 调用 migrateProductImages() 迁移图片 ✓ 但只迁移了主图！
    ├── 更新商品状态为 active ✓
    └── 触发翻译服务 ✓

问题：migrateProductImages() 只处理了 images 字段，遗漏了 color_options 字段
```

### 1.2 代码定位

**文件**: `src/app/api/admin/content-review/[id]/approve/route.ts`

**问题函数**: `migrateProductImages()` (第 81-173 行)

**问题代码**:
```typescript
// 第 98-101 行：只查询了 images，没有 color_options
const { data: product } = await admin
  .from('products')
  .select('id, images')  // ❌ 缺少 color_options
  .eq('id', productId)
  .single()

// 第 108-109 行：只处理主图
const images = (product.images ?? []) as string[]
const supabaseImageUrls = images.filter(isSupabaseStorageUrl)

// 第 156-159 行：只更新 images 字段
const { error: updateError } = await admin.from('products').update({
  images: newImages,
  updated_at: new Date().toISOString(),  // ❌ 没有更新 color_options
}).eq('id', productId)
```

### 1.3 影响范围

- **当前**: 新审核通过的商品，主图迁移到 Cloudinary，但颜色图片仍留在 Supabase
- **后果**: 
  1. 颜色图片未享受 Cloudinary CDN 加速
  2. Supabase 存储成本未释放（颜色图片未删除）
  3. 数据一致性差（主图和颜色图片分布在不同服务）

---

## 二、修复方案

### 方案选择：增强现有函数（推荐）

**理由**:
- 已有成熟的迁移逻辑（错误处理、删除原图、事务性）
- 只需扩展支持 color_options 字段
- 风险最小，改动最集中

---

## 三、详细实施步骤

### 步骤 1: 修改 migrateProductImages 函数

**文件**: `src/app/api/admin/content-review/[id]/approve/route.ts`

**修改范围**: 第 81-173 行

**具体修改**:

#### 3.1.1 修改查询字段（第 98-101 行）

**当前代码**:
```typescript
const { data: product } = await admin
  .from('products')
  .select('id, images')
  .eq('id', productId)
  .single()
```

**修改为**:
```typescript
const { data: product } = await admin
  .from('products')
  .select('id, images, color_options')  // ✅ 添加 color_options
  .eq('id', productId)
  .single()
```

#### 3.1.2 添加颜色图片处理逻辑（第 108-113 行之后）

**当前代码**:
```typescript
const images = (product.images ?? []) as string[]
const supabaseImageUrls = images.filter(isSupabaseStorageUrl)

if (supabaseImageUrls.length === 0) {
  return { success: true, migrated: 0 }
}
```

**修改为**:
```typescript
const images = (product.images ?? []) as string[]
const colorOptions = (product.color_options ?? []) as Array<{ name: string; image_url: string | null }>

// 收集主图中的 Supabase URL
const supabaseImageUrls = images.filter(isSupabaseStorageUrl)

// 收集颜色图片中的 Supabase URL
const colorOptionImageUrls = colorOptions
  .map(opt => opt.image_url)
  .filter((url): url is string => !!url && isSupabaseStorageUrl(url))

// 合并所有需要迁移的 URL
const allSupabaseUrls = [...supabaseImageUrls, ...colorOptionImageUrls]

if (allSupabaseUrls.length === 0) {
  return { success: true, migrated: 0 }
}
```

#### 3.1.3 修改迁移循环（第 119 行）

**当前代码**:
```typescript
for (const url of supabaseImageUrls) {
```

**修改为**:
```typescript
for (const url of allSupabaseUrls) {
```

#### 3.1.4 修改错误提示（第 145-152 行）

**当前代码**:
```typescript
if (failed.length > 0) {
  const firstReason = failed[0]?.reason ?? ''
  return {
    success: false,
    migrated: 0,
    error: `图片迁移失败 ${failed.length}/${supabaseImageUrls.length} 项${firstReason ? '：' + firstReason : ''}`,
  }
}
```

**修改为**:
```typescript
if (failed.length > 0) {
  const firstReason = failed[0]?.reason ?? ''
  return {
    success: false,
    migrated: 0,
    error: `图片迁移失败 ${failed.length}/${allSupabaseUrls.length} 项${firstReason ? '：' + firstReason : ''}`,
  }
}
```

#### 3.1.5 添加颜色选项更新逻辑（第 154-163 行之间）

**当前代码**:
```typescript
const newImages = images.map((url) => urlToNewUrl.get(url) ?? url)

const { error: updateError } = await admin.from('products').update({
  images: newImages,
  updated_at: new Date().toISOString(),
}).eq('id', productId)
```

**修改为**:
```typescript
const newImages = images.map((url) => urlToNewUrl.get(url) ?? url)

// 更新颜色选项中的图片 URL
const newColorOptions = colorOptions.map(opt => ({
  ...opt,
  image_url: opt.image_url ? (urlToNewUrl.get(opt.image_url) ?? opt.image_url) : null,
}))

const { error: updateError } = await admin.from('products').update({
  images: newImages,
  color_options: newColorOptions,  // ✅ 添加颜色选项更新
  updated_at: new Date().toISOString(),
}).eq('id', productId)
```

#### 3.1.6 完整修改后的函数

```typescript
async function migrateProductImages(
  admin: any,
  productId: string
): Promise<{ success: boolean; migrated: number; error?: string }> {
  const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME)?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    const missing = [
      !cloudName && 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME 或 CLOUDINARY_CLOUD_NAME',
      !apiKey && 'CLOUDINARY_API_KEY',
      !apiSecret && 'CLOUDINARY_API_SECRET',
    ].filter(Boolean)
    return { success: false, migrated: 0, error: `Cloudinary 未配置，请在 .env.local 中设置：${missing.join('、')}` }
  }

  // ✅ 修改 1: 添加 color_options 到查询
  const { data: product } = await admin
    .from('products')
    .select('id, images, color_options')
    .eq('id', productId)
    .single()

  if (!product) {
    return { success: false, migrated: 0, error: 'Product not found' }
  }

  const images = (product.images ?? []) as string[]
  // ✅ 修改 2: 解析 color_options
  const colorOptions = (product.color_options ?? []) as Array<{ name: string; image_url: string | null }>

  // 收集主图中的 Supabase URL
  const supabaseImageUrls = images.filter(isSupabaseStorageUrl)
  
  // ✅ 修改 3: 收集颜色图片中的 Supabase URL
  const colorOptionImageUrls = colorOptions
    .map(opt => opt.image_url)
    .filter((url): url is string => !!url && isSupabaseStorageUrl(url))

  // ✅ 修改 4: 合并所有需要迁移的 URL
  const allSupabaseUrls = [...supabaseImageUrls, ...colorOptionImageUrls]

  if (allSupabaseUrls.length === 0) {
    return { success: true, migrated: 0 }
  }

  const failed: { url: string; reason: string }[] = []
  const toDelete: { bucket: string; path: string }[] = []
  const urlToNewUrl = new Map<string, string>()

  // ✅ 修改 5: 遍历所有 URL（包括颜色图片）
  for (const url of allSupabaseUrls) {
    try {
      const parsed = parseSupabasePublicUrl(url)
      if (!parsed) {
        failed.push({ url, reason: 'invalid_supabase_url' })
        continue
      }

      const res = await fetch(url, { headers: { 'User-Agent': 'Stratos-Approve/1' } })
      if (!res.ok) {
        failed.push({ url, reason: `fetch_${res.status}` })
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const cloudinaryUrl = await uploadImageToCloudinary(buffer, cloudName, apiKey, apiSecret, 'products', contentType)

      urlToNewUrl.set(url, cloudinaryUrl)
      toDelete.push({ bucket: parsed.bucket, path: parsed.path })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ url, reason })
    }
  }

  // ✅ 修改 6: 更新错误提示中的总数
  if (failed.length > 0) {
    const firstReason = failed[0]?.reason ?? ''
    return {
      success: false,
      migrated: 0,
      error: `图片迁移失败 ${failed.length}/${allSupabaseUrls.length} 项${firstReason ? '：' + firstReason : ''}`,
    }
  }

  const newImages = images.map((url) => urlToNewUrl.get(url) ?? url)
  
  // ✅ 修改 7: 更新颜色选项中的图片 URL
  const newColorOptions = colorOptions.map(opt => ({
    ...opt,
    image_url: opt.image_url ? (urlToNewUrl.get(opt.image_url) ?? opt.image_url) : null,
  }))

  // ✅ 修改 8: 更新数据库时包含 color_options
  const { error: updateError } = await admin.from('products').update({
    images: newImages,
    color_options: newColorOptions,
    updated_at: new Date().toISOString(),
  }).eq('id', productId)

  if (updateError) {
    return { success: false, migrated: 0, error: 'Failed to update product: ' + updateError.message }
  }

  // 删除 Supabase 临时文件
  for (const { bucket, path } of toDelete) {
    const { error: deleteError } = await admin.storage.from(bucket).remove([path])
    if (deleteError) {
      console.error('[approve] Supabase storage remove failed', { productId, bucket, path, error: deleteError.message })
    }
  }

  return { success: true, migrated: toDelete.length }
}
```

---

## 四、历史数据修复

### 4.1 问题分析

已有商品审核通过但颜色图片未迁移，需要批量修复。

### 4.2 创建批量修复脚本

**文件**: `src/app/api/admin/fix-color-images-migration/route.ts`（新建）

```typescript
/**
 * 批量修复颜色图片迁移
 * 用于修复历史数据中颜色图片未迁移的问题
 * 仅管理员可访问
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const SUPABASE_PUBLIC_PATTERN = /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

function isSupabaseStorageUrl(url: string): boolean {
  return !!url && url.includes('supabase.co') && !!url.match(SUPABASE_PUBLIC_PATTERN)
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (!authResult.success) {
    return authResult.response
  }

  const admin = await getSupabaseAdmin()

  try {
    // 1. 查询所有已审核通过且有颜色图片的商品
    const { data: products, error: fetchError } = await admin
      .from('products')
      .select('id, name, color_options, images')
      .eq('status', 'active')
      .not('color_options', 'is', null)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const results = {
      total: products?.length ?? 0,
      needsMigration: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      details: [] as Array<{
        id: string
        name: string
        status: 'migrated' | 'failed' | 'skipped'
        error?: string
        imagesCount?: number
      }>,
    }

    // 2. 遍历每个商品
    for (const product of products || []) {
      const colorOptions = (product.color_options ?? []) as Array<{ name: string; image_url: string | null }>
      
      // 检查是否有需要迁移的 Supabase URL
      const hasSupabaseImages = colorOptions.some(
        opt => opt.image_url && isSupabaseStorageUrl(opt.image_url)
      )

      if (!hasSupabaseImages) {
        results.skipped++
        results.details.push({
          id: product.id,
          name: product.name,
          status: 'skipped',
        })
        continue
      }

      results.needsMigration++

      // 3. 调用单个商品修复接口
      try {
        const response = await fetch(`${request.nextUrl.origin}/api/cloudinary/migrate-product-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id }),
        })

        if (response.ok) {
          const data = await response.json()
          results.migrated++
          results.details.push({
            id: product.id,
            name: product.name,
            status: 'migrated',
            imagesCount: data.migrated,
          })
        } else {
          const error = await response.text()
          results.failed++
          results.details.push({
            id: product.id,
            name: product.name,
            status: 'failed',
            error: error.slice(0, 200),
          })
        }
      } catch (e) {
        results.failed++
        results.details.push({
          id: product.id,
          name: product.name,
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        })
      }

      // 4. 添加延迟，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      ok: true,
      summary: results,
    })

  } catch (error) {
    console.error('[fix-color-images-migration] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch migration failed' },
      { status: 500 }
    )
  }
}
```

**注意**: 需要先确保 `migrate-product-images` API 已修复支持 color_options。

---

## 五、验证步骤

### 5.1 新商品审核验证

1. **创建测试商品**
   ```bash
   # 卖家账号
   - 上传 2 张主图
   - 添加 2 个颜色选项，每个颜色上传 1 张图片
   - 提交审核
   ```

2. **管理员审核**
   ```bash
   # 管理员账号
   - 审核通过商品
   - 观察审核是否成功
   ```

3. **验证迁移结果**
   ```sql
   -- 检查数据库
   SELECT id, name, images, color_options
   FROM products
   WHERE id = '测试商品ID'
   
   -- 预期结果：
   -- images: ["https://res.cloudinary.com/...", "https://res.cloudinary.com/..."]
   -- color_options: [
   --   {"name": "红色", "image_url": "https://res.cloudinary.com/..."},
   --   {"name": "蓝色", "image_url": "https://res.cloudinary.com/..."}
   -- ]
   ```

4. **验证 Supabase 清理**
   ```sql
   -- 检查 Supabase storage 中的对应文件是否已删除
   -- 或者通过 Supabase Dashboard 查看
   ```

### 5.2 历史数据修复验证

1. **调用批量修复接口**
   ```bash
   curl -X POST http://localhost:3000/api/admin/fix-color-images-migration \
     -H "Content-Type: application/json" \
     -H "Cookie: 管理员session"
   ```

2. **检查结果**
   ```json
   {
     "ok": true,
     "summary": {
       "total": 100,
       "needsMigration": 20,
       "migrated": 20,
       "failed": 0,
       "skipped": 80,
       "details": [...]
     }
   }
   ```

---

## 六、回滚方案

如果迁移失败，需要快速回滚：

### 6.1 数据库备份

在修复前备份 affected products：
```sql
CREATE TABLE products_backup_20260208 AS
SELECT * FROM products
WHERE status = 'active'
  AND color_options::text LIKE '%supabase.co%'
```

### 6.2 紧急回滚

如果新代码导致审核失败，快速回滚到旧版本：
```bash
git checkout HEAD -- src/app/api/admin/content-review/[id]/approve/route.ts
npm run build
pm2 restart stratos
```

---

## 七、实施时间表

| 阶段 | 任务 | 预计时间 | 负责人 |
|------|------|----------|--------|
| 1 | 修改 approve/route.ts | 30 分钟 | 开发 |
| 2 | 本地测试验证 | 30 分钟 | 开发 |
| 3 | 部署到测试环境 | 15 分钟 | 运维 |
| 4 | 测试环境验证 | 30 分钟 | 测试 |
| 5 | 部署到生产环境 | 15 分钟 | 运维 |
| 6 | 生产环境验证 | 30 分钟 | 测试 |
| 7 | 历史数据修复 | 2-4 小时 | 运维 |
| 8 | 监控和回滚准备 | 持续 | 运维 |

**总计**: 约 6-8 小时（含历史数据修复）

---

## 八、注意事项

### 8.1 关键检查点

- [x] 确保 Cloudinary 配置正确（环境变量）
- [x] 确保 Supabase Storage 有删除权限
- [x] 确保数据库 products 表有 color_options 字段
- [x] 备份关键数据后再执行

### 8.2 监控指标

- 审核通过率是否下降
- 图片迁移成功率
- Supabase Storage 使用率变化
- Cloudinary 使用量增长

### 8.3 日志关键字

```
[approve] Supabase storage remove failed  # 删除失败（需关注）
[approve] migrateProductImages            # 迁移函数调用
[migrate-product-images]                  # 独立迁移 API 调用
```

---

## 九、代码变更汇总

### 修改文件
1. `src/app/api/admin/content-review/[id]/approve/route.ts`
   - 修改 `migrateProductImages` 函数（第 81-173 行）
   - 6 处关键修改点（见上文）

### 新增文件
1. `src/app/api/admin/fix-color-images-migration/route.ts`
   - 批量修复历史数据

---

## 十、结论

通过本次修复：
- ✅ 新审核通过的商品，颜色图片将正确迁移到 Cloudinary
- ✅ Supabase 中的临时颜色图片将被删除
- ✅ 历史数据可通过批量修复脚本处理
- ✅ 不影响现有审核流程和用户体验

**风险等级**: 中（修改核心审核流程，但有完善错误处理和回滚方案）

**建议实施时间**: 低峰期（如周末凌晨）

---

*文档版本*: v1.0
*创建时间*: 2026-02-08
*最后更新*: 2026-02-08
*状态*: 待实施
