# 商品详情页面国际化翻译问题根因分析与修复方案

## 问题描述

中文页面 (`/zh/product/xxx`) 显示英文翻译，而英文页面 (`/en/product/xxx`) 显示正常。

**具体表现**:
- 中文页面显示：Description, Stock, Color Options, Select size, Seller, Add to Cart, Buy Now（全部英文）
- 英文页面显示：Description, Stock, Color Options, Select size, Seller, Add to Cart, Buy Now（全部英文 - 正确）

---

## 🔴 根因分析

### 核心问题：`getTranslations` 未传递 `locale` 参数

**问题代码位置**: `src/app/[locale]/(main)/product/[id]/page.tsx` 第59-62行

**当前代码**:
```typescript
const t = await getTranslations('products')      // ❌ 错误：缺少 locale 参数
const tCommon = await getTranslations('common')  // ❌ 错误：缺少 locale 参数
const tPosts = await getTranslations('posts')    // ❌ 错误：缺少 locale 参数
const tMessages = await getTranslations('messages')  // ❌ 错误：缺少 locale 参数
```

### 为什么会导致这个问题？

**1. 查看国际化配置** (`src/i18n/config.ts`):
```typescript
export const defaultLocale: Locale = 'en'  // 默认语言是英文
```

**2. next-intl 的行为**:
- 当调用 `getTranslations('products')` 不传递 `locale` 参数时
- next-intl 会回退到 `defaultLocale`（即 `'en'`）
- 所以无论访问 `/zh/` 还是 `/en/`，都返回**英文**翻译！

**3. 为什么英文页面"看起来"正常？**
- 因为英文页面本来就是应该显示英文
- 但这个"正常"是巧合，实际上两个页面都在显示英文

**4. 正确的调用方式**:
查看项目中正确实现的页面 (`admin/dashboard/page.tsx`):
```typescript
const t = await getTranslations({ locale, namespace: 'admin' })  // ✅ 正确：传递了 locale
```

---

## 📝 详细修复步骤

### 步骤1：提取 locale 参数（1分钟）

**文件**: `src/app/[locale]/(main)/product/[id]/page.tsx`

**修改位置**: 第6-12行

**当前代码**:
```typescript
export default async function ProductPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  const supabase = await createClient()  // 第12行
```

**修改为**:
```typescript
export default async function ProductPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  const { locale } = params  // ✅ 添加：提取 locale 参数
  const supabase = await createClient()
```

---

### 步骤2：修复所有 getTranslations 调用（2分钟）

**文件**: `src/app/[locale]/(main)/product/[id]/page.tsx`

**修改位置**: 第59-62行

**当前代码**:
```typescript
const t = await getTranslations('products')
const tCommon = await getTranslations('common')
const tPosts = await getTranslations('posts')
const tMessages = await getTranslations('messages')
```

**修改为**:
```typescript
const t = await getTranslations({ locale, namespace: 'products' })
const tCommon = await getTranslations({ locale, namespace: 'common' })
const tPosts = await getTranslations({ locale, namespace: 'posts' })
const tMessages = await getTranslations({ locale, namespace: 'messages' })
```

---

### 步骤3：完整修改后的 page.tsx 代码（参考）

```typescript
import { createClient } from '@/lib/supabase/server'
import { ProductPageClient } from './ProductPageClient'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

export default async function ProductPage({
  params,
}: {
  params: { id: string; locale: string }
}) {
  const { locale } = params  // ✅ 修复1：提取 locale 参数
  const supabase = await createClient()
  const productId = params.id

  // Fetch product data on server
  const { data: product, error } = await supabase
        .from('products')
        .select(`
          id, name, description, details, category, price, currency, stock, 
          images, status, seller_id, condition, shipping_fee, sales_countries,
          color_options, sizes, faq, allow_affiliate, commission_rate,
          content_lang, 
          name_translated, description_translated, details_translated, 
          category_translated, faq_translated,
          like_count, want_count, share_count, repost_count, favorite_count,
          seller:profiles!products_seller_id_fkey(username, display_name)
        `)
        .eq('id', productId)
        .eq('status', 'active')
        .single()
      
  if (error || !product) {
    notFound()
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Parse FAQ JSONB field
  let parsedFaq = null
  if (product.faq) {
    try {
      parsedFaq = typeof product.faq === 'string' ? JSON.parse(product.faq) : product.faq
    } catch (e) {
      parsedFaq = []
    }
  }

  // Ensure all count fields have default values
  const productData = {
    ...product,
    faq: parsedFaq,
    like_count: product.like_count || 0,
    want_count: product.want_count || 0,
    share_count: product.share_count || 0,
    repost_count: product.repost_count || 0,
    favorite_count: product.favorite_count || 0,
  }

  // ✅ 修复2：所有 getTranslations 调用都传递 locale 参数
  const t = await getTranslations({ locale, namespace: 'products' })
  const tCommon = await getTranslations({ locale, namespace: 'common' })
  const tPosts = await getTranslations({ locale, namespace: 'posts' })
  const tMessages = await getTranslations({ locale, namespace: 'messages' })

  return (
    <ProductPageClient
      product={productData}
      user={user}
      translations={{
        loadFailed: t('loadFailed'),
        description: t('description'),
        stock: t('stock'),
        seller: t('seller'),
        report: t('report'),
        addedToCart: t('addedToCart'),
        addToCart: t('addToCart'),
        buyNow: t('buyNow'),
        noImage: tCommon('noImage'),
        removeFromFavorites: tPosts('removeFromFavorites'),
        addToFavorites: tPosts('addToFavorites'),
        chatWithSeller: tMessages('chatWithSeller'),
        selectSize: tCommon('selectSize'),
        viewProduct: t('viewProduct'),
        colorOptions: t('colorOptions'),
        noImageColor: t('noImageColor'),
      }}
    />
  )
}
```

---

## 🔍 修复验证步骤

### 步骤1：清除缓存（重要！）

```bash
# 停止开发服务器
# 删除 Next.js 缓存
rm -rf .next

# 重新启动开发服务器
npm run dev
```

### 步骤2：测试验证

访问以下URL并检查文本语言：

**中文页面** (`http://localhost:3000/zh/product/xxx`):
- [ ] Description 显示"商品描述"
- [ ] Stock 显示"库存"
- [ ] Color Options 显示"颜色选项"
- [ ] Select size 显示"选择尺寸"
- [ ] Seller 显示"卖家"
- [ ] 购物车按钮显示"加入购物车"
- [ ] 立即购买按钮显示"立即购买"

**英文页面** (`http://localhost:3000/en/product/xxx`):
- [ ] Description 显示"Description"
- [ ] Stock 显示"Stock"
- [ ] Color Options 显示"Color Options"
- [ ] Select size 显示"Select size"
- [ ] Seller 显示"Seller"
- [ ] 购物车按钮显示"Add to Cart"
- [ ] 立即购买按钮显示"Buy Now"

---

## ⚠️ 扩展：检查项目中其他页面

这是一个**系统性问题**，项目中可能有其他页面也有同样的问题。

**需要检查的页面列表**:

1. `src/app/[locale]/(main)/about/layout.tsx`
2. `src/app/[locale]/(main)/privacy/layout.tsx`
3. `src/app/[locale]/(main)/admin/review/page.tsx`
4. `src/app/[locale]/(main)/help/layout.tsx`
5. `src/app/[locale]/(main)/loading.tsx`
6. `src/app/[locale]/(main)/banned/page.tsx`
7. `src/app/[locale]/(main)/orders/page.tsx`

**检查方法**:
```bash
# 搜索所有使用 getTranslations 但没有 locale 参数的文件
grep -r "await getTranslations('[a-z]" src/app/[locale] --include="*.tsx"
```

**正确的调用模式**:
```typescript
// ❌ 错误
const t = await getTranslations('products')

// ✅ 正确
const t = await getTranslations({ locale, namespace: 'products' })
```

---

## 📋 修复清单

- [ ] 修改 `page.tsx` 第10行：添加 `const { locale } = params`
- [ ] 修改 `page.tsx` 第59行：`getTranslations({ locale, namespace: 'products' })`
- [ ] 修改 `page.tsx` 第60行：`getTranslations({ locale, namespace: 'common' })`
- [ ] 修改 `page.tsx` 第61行：`getTranslations({ locale, namespace: 'posts' })`
- [ ] 修改 `page.tsx` 第62行：`getTranslations({ locale, namespace: 'messages' })`
- [ ] 清除 `.next` 缓存
- [ ] 重启开发服务器
- [ ] 测试中文页面显示中文
- [ ] 测试英文页面显示英文

---

## 🎯 总结

**问题**: `getTranslations` 没有传递 `locale` 参数，导致总是使用默认语言（英文）

**影响**: 所有使用错误方式调用 `getTranslations` 的页面，无论访问什么语言路径都显示英文

**修复**: 在所有 `getTranslations` 调用中添加 `{ locale, namespace: 'xxx' }` 参数

**预计修复时间**: 3分钟（仅商品详情页）

---

*文档创建时间*: 2026-02-08  
*问题根因*: next-intl getTranslations 未传递 locale 参数  
*预计修复时间*: 3分钟  
*状态*: 待执行
