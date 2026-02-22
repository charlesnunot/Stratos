# 商品翻译显示优化 - 详细实施计划

## 概述

本计划针对商品详情页面翻译显示功能的剩余5%优化项，确保所有用户可见文本都能根据当前语言环境正确显示翻译内容。

**当前完成度**: 95%  
**目标完成度**: 100%  
**预计总工期**: 21分钟

---

## 优化项清单

### 🔴 P1 高优先级（建议立即修复）

#### 1. ShareDialog 翻译修复

**问题**: 分享对话框的标题和描述仍使用原文（`product.name`, `product.description`）

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**修改位置**: 第626-627行

**当前代码**:
```typescript
<ShareDialog
  open={showShareDialog}
  onClose={() => setShowShareDialog(false)}
  url={`${typeof window !== 'undefined' ? window.location.origin : ''}/product/${productId}`}
  title={product.name || '查看这个商品'}          // ❌ 使用原文
  description={product.description || undefined}  // ❌ 使用原文
  image={product.images?.[0]}
  itemType="product"
  itemId={productId}
/>
```

**修改后代码**:
```typescript
<ShareDialog
  open={showShareDialog}
  onClose={() => setShowShareDialog(false)}
  url={`${typeof window !== 'undefined' ? window.location.origin : ''}/product/${productId}`}
  title={displayName || '查看这个商品'}          // ✅ 使用翻译后名称
  description={displayDescription || undefined}  // ✅ 使用翻译后描述
  image={product.images?.[0]}
  itemType="product"
  itemId={productId}
/>
```

**影响**: 
- 分享到社交媒体（微信、Twitter等）时显示正确语言
- SEO元数据正确
- **预计时间**: 2分钟

---

#### 2. ChatButton shareCard 翻译修复

**问题**: 聊天分享卡片中的商品名称使用原文

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**修改位置**: 第516行（在 ChatButton 组件内）

**当前代码**:
```typescript
<ChatButton
  targetUserId={product.seller_id}
  variant="outline"
  size="sm"
  shareCard={{
    type: 'product',
    id: product.id,
    name: product.name,  // ❌ 使用原文
    price: product.price,
    image: selectedColorImage || product.images?.[0],
    url: `/product/${product.id}`,
  }}
>
  {translations.chatWithSeller}
</ChatButton>
```

**修改后代码**:
```typescript
<ChatButton
  targetUserId={product.seller_id}
  variant="outline"
  size="sm"
  shareCard={{
    type: 'product',
    id: product.id,
    name: displayName,  // ✅ 使用翻译后名称
    price: product.price,
    image: selectedColorImage || product.images?.[0],
    url: `/product/${product.id}`,
  }}
>
  {translations.chatWithSeller}
</ChatButton>
```

**影响**:
- 聊天窗口中的商品卡片显示正确语言
- 提升用户体验
- **预计时间**: 2分钟

---

### 🟢 P2 中优先级（建议修复）

#### 3. 图片 Alt 属性翻译

**问题**: 商品图片的 alt 属性（替代文本）使用原文，影响可访问性和SEO

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**修改位置**: 第326、335、348行

**当前代码**:
```typescript
// 第326行
<img
  src={selectedColorImage}
  alt={`${product.name} - ${selectedColor}`}  // ❌ 使用原文
/>

// 第335行
<img
  src={product.images[0]}
  alt={product.name}  // ❌ 使用原文
/>

// 第348行
<img
  src={image}
  alt={`${product.name} ${index + 2}`}  // ❌ 使用原文
/>
```

**修改后代码**:
```typescript
// 第326行
<img
  src={selectedColorImage}
  alt={`${displayName} - ${getLocalizedColorName(selectedColor || '', locale)}`}  // ✅ 翻译名称和颜色
/>

// 第335行
<img
  src={product.images[0]}
  alt={displayName}  // ✅ 使用翻译后名称
/>

// 第348行
<img
  src={image}
  alt={`${displayName} ${index + 2}`}  // ✅ 使用翻译后名称
/>
```

**注意**: 第326行还需要导入 `getLocalizedColorName`（如果尚未导入）

**影响**:
- 图片加载失败时显示正确语言的替代文本
- 屏幕阅读器（无障碍访问）读取正确语言
- SEO优化
- **预计时间**: 5分钟

---

### ⚪ P3 低优先级（可选）

#### 4. 清理未使用变量

**问题**: `displayCategory` 被计算但未被使用

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**位置**: 第86行

**方案A - 移除未使用变量**（推荐，保持代码整洁）:
```typescript
// 删除第86行
// const displayCategory = getLocalizedContent(product.category, product.category_translated)
```

**方案B - 添加分类显示**（如果需要在UI中显示分类）:

如果需要在页面显示商品分类，可以在商品信息区域添加：

```typescript
// 在商品描述下方添加分类显示
{displayCategory && (
  <p className="mb-2 text-sm text-muted-foreground">
    {t('category')}: {displayCategory}
  </p>
)}
```

**需要同时添加国际化翻译**:
- `src/messages/zh.json`: `"category": "分类"`
- `src/messages/en.json`: `"category": "Category"`

**建议**: 先执行方案A移除，后续如需要显示分类再实施方案B
**预计时间**: 2分钟

---

## 实施时间表

| 阶段 | 内容 | 文件 | 预计时间 | 优先级 |
|------|------|------|----------|--------|
| 1 | ShareDialog 翻译 | ProductPageClient.tsx | 2分钟 | 🟡 P1 |
| 2 | ChatButton 翻译 | ProductPageClient.tsx | 2分钟 | 🟡 P1 |
| 3 | 图片 Alt 翻译 | ProductPageClient.tsx | 5分钟 | 🟢 P2 |
| 4 | 清理未使用变量 | ProductPageClient.tsx | 2分钟 | ⚪ P3 |
| 5 | 回归测试 | - | 10分钟 | 🔴 P0 |
| **总计** | | | **约21分钟** | |

---

## 回归测试验证

### 测试用例1：ShareDialog 翻译
```bash
# 1. 访问英文商品页面
http://localhost:3000/en/product/xxx

# 2. 点击分享按钮
# 3. 检查分享预览/弹窗中的标题和描述是否为英文
# 预期: 显示英文翻译内容
```

### 测试用例2：ChatButton 分享卡片
```bash
# 1. 访问英文商品页面
# 2. 点击"联系卖家"按钮
# 3. 检查聊天窗口中的商品卡片名称是否为英文
# 预期: 显示英文翻译的商品名称
```

### 测试用例3：图片 Alt 属性
```bash
# 1. 访问英文商品页面
# 2. 使用浏览器开发者工具检查图片元素
# 3. 验证 alt 属性是否为英文
# 命令: 在 Console 中运行 document.querySelectorAll('img').forEach(img => console.log(img.alt))
# 预期: 所有 alt 文本为英文
```

### 测试用例4：边界情况
```bash
# 测试 content_lang 为 null 的商品
# 测试翻译字段为 null 的商品
# 预期: 正确回退到原文显示，无错误
```

---

## 代码审查清单

修复完成后，请确认：

- [ ] ShareDialog 的 `title` 使用 `displayName`
- [ ] ShareDialog 的 `description` 使用 `displayDescription`
- [ ] ChatButton shareCard 的 `name` 使用 `displayName`
- [ ] 所有 `<img>` 标签的 `alt` 属性使用翻译后的值
- [ ] 移除了未使用的 `displayCategory` 变量（或添加了分类显示）
- [ ] 所有功能在 `/zh/` 和 `/en/` 路径下测试通过
- [ ] 无 TypeScript 编译错误
- [ ] 无 ESLint 警告

---

## 风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 翻译字段为 null | 中 | 低 | 已通过 `getDisplayContent` 实现回退机制 |
| 颜色名称未映射 | 中 | 低 | 未映射的颜色显示原文，不影响功能 |
| 分享预览缓存 | 低 | 中 | 社交媒体可能缓存旧标题，需等待刷新或强制刷新 |

---

## 后续优化建议（可选）

1. **添加翻译指示器**: 当显示翻译内容时，显示小图标提示用户这是翻译版本
2. **手动切换**: 允许用户在原文和译文之间手动切换
3. **翻译质量反馈**: 添加按钮让用户反馈翻译质量问题
4. **自动翻译缺失内容**: 对于未翻译的商品，实时调用AI翻译API

---

## 快速修复命令

如果您希望一次性完成所有修改，可以按以下顺序执行：

```bash
# 1. 备份原文件
cp src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx.backup

# 2. 启动开发服务器进行测试
npm run dev

# 3. 访问测试页面
curl http://localhost:3000/en/product/YOUR_PRODUCT_ID
```

---

**计划创建时间**: 2026-02-08  
**适用版本**: Stratos v0.1.1  
**预计总工期**: 21分钟  
**完成后完成度**: 100%
