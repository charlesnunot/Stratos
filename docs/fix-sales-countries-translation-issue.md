# 商品详情页国际化翻译键问题修复方案

## 问题描述

商品详情页显示：`seller.salesCountriesTo` 而不是正确的翻译文本"销售至"（中文）或"Sold to"（英文）。

**问题URL**: `http://localhost:3000/zh/product/72a0466d-d3a5-47fc-a420-b680ab8357fb`

**显示效果**:
```
销售国家/地区: seller.salesCountriesTo 美国, 日本, 韩国...
```

**预期效果**:
```
销售国家/地区: 销售至 美国, 日本, 韩国...  （中文页面）
或
Sales Countries: Sold to USA, Japan, Korea...  （英文页面）
```

---

## 🔍 根因分析

### 问题定位

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**第72行**:
```typescript
const t = useTranslations('seller')  // ❌ 使用的是 'seller' namespace
```

**第453行**:
```typescript
{t('salesCountries')}: {t('salesCountriesTo')} {product.sales_countries.map(...)}
```

### 为什么显示 `seller.salesCountriesTo`？

1. `useTranslations('seller')` 从 seller namespace 查找翻译键
2. 但 `salesCountriesTo` 实际定义在 **products** namespace
3. 当翻译键找不到时，next-intl 返回完整键名 `seller.salesCountriesTo`

### 翻译键实际位置

**文件**: `src/messages/zh.json` 第388行
```json
"salesCountriesTo": "销售至"
```

**文件**: `src/messages/en.json` 第388行
```json
"salesCountriesTo": "Sold to"
```

**两个文件都在 `products` namespace 下，不在 `seller` namespace 下。**

---

## 📝 修复实施方案

### 方案1：从 page.tsx 传递 translations（推荐）

保持组件的依赖注入模式，通过 props 传递翻译文本。

#### 步骤1：修改 page.tsx 添加翻译

**文件**: `src/app/[locale]/(main)/product/[id]/page.tsx`

**位置**: 第75-92行（translations 对象）

**当前代码**:
```typescript
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
```

**修改为**:
```typescript
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
      // ✅ 添加销售国家相关的翻译
      salesCountries: t('salesCountries'),
      salesCountriesTo: t('salesCountriesTo'),
      salesCountriesGlobal: t('salesCountriesGlobal'),
    }}
  />
)
```

---

#### 步骤2：修改 ProductPageClient.tsx 接口定义

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**位置**: 第34-54行（interface ProductPageClientProps）

**当前代码**:
```typescript
interface ProductPageClientProps {
  product: Product
  user: { id: string } | null
  translations: {
    loadFailed: string
    description: string
    stock: string
    seller: string
    report: string
    addedToCart: string
    addToCart: string
    buyNow: string
    noImage: string
    removeFromFavorites: string
    addToFavorites: string
    chatWithSeller: string
    selectSize: string
    viewProduct: string
    colorOptions: string
    noImageColor: string
  }
}
```

**修改为**:
```typescript
interface ProductPageClientProps {
  product: Product
  user: { id: string } | null
  translations: {
    loadFailed: string
    description: string
    stock: string
    seller: string
    report: string
    addedToCart: string
    addToCart: string
    buyNow: string
    noImage: string
    removeFromFavorites: string
    addToFavorites: string
    chatWithSeller: string
    selectSize: string
    viewProduct: string
    colorOptions: string
    noImageColor: string
    // ✅ 添加销售国家相关的翻译类型
    salesCountries: string
    salesCountriesTo: string
    salesCountriesGlobal: string
  }
}
```

---

#### 步骤3：修改 ProductPageClient.tsx 使用 translations

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**位置**: 第453行（销售国家/地区显示）

**当前代码**:
```typescript
{/* Sales Countries */}
{(product.sales_countries == null || product.sales_countries.length === 0) ? (
  <p className="mb-2 text-sm text-muted-foreground">
    {t('salesCountries')}: {t('salesCountriesGlobal')}
  </p>
) : (
  <p className="mb-2 text-sm text-muted-foreground">
    {t('salesCountries')}: {t('salesCountriesTo')} {product.sales_countries.map((code: string) => getCountryDisplayName(code, locale as 'zh' | 'en')).join(', ')}
  </p>
)}
```

**修改为**:
```typescript
{/* Sales Countries */}
{(product.sales_countries == null || product.sales_countries.length === 0) ? (
  <p className="mb-2 text-sm text-muted-foreground">
    {translations.salesCountries}: {translations.salesCountriesGlobal}
  </p>
) : (
  <p className="mb-2 text-sm text-muted-foreground">
    {translations.salesCountries}: {translations.salesCountriesTo} {product.sales_countries.map((code: string) => getCountryDisplayName(code, locale as 'zh' | 'en')).join(', ')}
  </p>
)}
```

---

### 方案2：在 ProductPageClient 中使用 products namespace（备选）

在组件内直接使用 `useTranslations('products')` 获取 products namespace 的翻译。

#### 修改 ProductPageClient.tsx

**位置**: 第72-73行

**当前代码**:
```typescript
const t = useTranslations('seller')
const locale = useLocale()
```

**修改为**:
```typescript
const t = useTranslations('seller')
const tProducts = useTranslations('products')  // ✅ 添加 products namespace
const locale = useLocale()
```

**位置**: 第453行（销售国家/地区显示）

**修改为**:
```typescript
{/* Sales Countries */}
{(product.sales_countries == null || product.sales_countries.length === 0) ? (
  <p className="mb-2 text-sm text-muted-foreground">
    {tProducts('salesCountries')}: {tProducts('salesCountriesGlobal')}
  </p>
) : (
  <p className="mb-2 text-sm text-muted-foreground">
    {tProducts('salesCountries')}: {tProducts('salesCountriesTo')} {product.sales_countries.map((code: string) => getCountryDisplayName(code, locale as 'zh' | 'en')).join(', ')}
  </p>
)}
```

---

## 🎯 推荐方案

**推荐方案1**（通过 props 传递 translations）：
- 保持组件的依赖注入模式
- 不增加额外的 useTranslations 调用
- 与项目中其他翻译传递方式一致
- 便于测试和维护

---

## 📋 修改清单

### 方案1修改清单（3个文件）

- [ ] 修改 `page.tsx` - 在 translations 对象中添加 salesCountries、salesCountriesTo、salesCountriesGlobal
- [ ] 修改 `ProductPageClient.tsx` - 在 interface 中添加 3 个翻译类型
- [ ] 修改 `ProductPageClient.tsx` - 将 `t('...')` 改为 `translations....`

### 方案2修改清单（1个文件）

- [ ] 修改 `ProductPageClient.tsx` - 添加 `const tProducts = useTranslations('products')`
- [ ] 修改 `ProductPageClient.tsx` - 将销售国家相关的 `t('...')` 改为 `tProducts('...')`

---

## ✅ 验证测试

### 修复后验证

1. **访问中文页面**
   ```
   http://localhost:3000/zh/product/72a0466d-d3a5-47fc-a420-b680ab8357fb
   ```
   **预期**: 显示"销售国家/地区: 销售至 美国, 日本, 韩国..."

2. **访问英文页面**
   ```
   http://localhost:3000/en/product/72a0466d-d3a5-47fc-a420-b680ab8357fb
   ```
   **预期**: 显示"Sales Countries: Sold to USA, Japan, Korea..."

3. **无销售国家商品测试**
   找一个 `sales_countries` 为空的商品
   **预期**: 显示"销售国家/地区: 全球"（中文）或"Sales Countries: Global"（英文）

---

## ⚠️ 注意事项

1. **确保翻译键存在**: 在修改前，确认 `messages/zh.json` 和 `messages/en.json` 中确实有以下键：
   - `products.salesCountries`
   - `products.salesCountriesTo`
   - `products.salesCountriesGlobal`

2. **类型检查**: 修改后运行 `npm run typecheck` 确保无类型错误

3. **清除缓存**: 修改后清除 `.next` 缓存并重启开发服务器

4. **其他硬编码检查**: 建议全局搜索 `t('` 检查是否还有其他地方使用了错误的 namespace

---

## 🔍 相关代码参考

### messages/zh.json（第388行附近）
```json
{
  "salesCountries": "销售国家/地区",
  "salesCountriesTo": "销售至",
  "salesCountriesGlobal": "全球"
}
```

### messages/en.json（第388行附近）
```json
{
  "salesCountries": "Sales Countries",
  "salesCountriesTo": "Sold to",
  "salesCountriesGlobal": "Global"
}
```

### 当前问题代码
```typescript
// ProductPageClient.tsx 第72行
const t = useTranslations('seller')  // ❌ 错误：使用 seller namespace

// ProductPageClient.tsx 第453行
{t('salesCountries')}: {t('salesCountriesTo')}  // ❌ 错误：从 seller namespace 查找
```

### 修复后代码（方案1）
```typescript
// page.tsx - translations 对象
salesCountries: t('salesCountries'),
salesCountriesTo: t('salesCountriesTo'),
salesCountriesGlobal: t('salesCountriesGlobal'),

// ProductPageClient.tsx - 使用 translations
{translations.salesCountries}: {translations.salesCountriesTo}
```

---

*文档创建时间*: 2026-02-08
*适用版本*: Stratos v0.1.1
*问题类型*: 国际化翻译键 namespace 错误
*预计修复时间*: 5分钟
*状态*: 待实施
