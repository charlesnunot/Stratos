# 商品详情页货币显示问题修复方案

## 问题描述

商品详情页 (`/zh/product/xxx` 和 `/en/product/xxx`) 中，货币符号被硬编码为 `¥`，不能根据用户语言环境自动切换。

**对比**:
- ❌ 商品详情页: 始终显示 `¥` 符号（硬编码）
- ✅ 商品列表页: 根据语言自动切换（英文显示 `$`，中文显示 `¥`）

**具体表现**:
- 中文页面 (`/zh/product/xxx`): 价格显示 `¥100.00`（正确）
- 英文页面 (`/en/product/xxx`): 价格显示 `¥100.00`（错误，应该显示 `$100.00`）

---

## 🔍 根因分析

### 问题代码位置

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**问题1: 主价格显示**（第372行）
```typescript
<p className="text-2xl md:text-3xl font-bold text-primary">
  ¥{product.price.toFixed(2)}  // ❌ 硬编码 ¥ 符号
</p>
```

**问题2: 运费显示**（第426行）
```typescript
<p className="mb-2 text-sm text-muted-foreground">
  {t('shippingFee')}: ¥{product.shipping_fee.toFixed(2)}  // ❌ 硬编码 ¥ 符号
</p>
```

**问题3: 价格变动警告**（第159行和第220行）
```typescript
showWarning(`商品价格已更新为 ¥${currentProduct.price.toFixed(2)}，请刷新页面后重试`)  // ❌ 硬编码 ¥ 符号
```

### 为什么商品列表页能正常工作？

**文件**: `src/components/ecommerce/product-card/ProductCardView.tsx` 第56-60行

```typescript
const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
const priceDisplay = useMemo(
  () => formatPriceWithConversion(dto.price, dto.currency as Currency, userCurrency),
  [dto.price, dto.currency, userCurrency]
)
```

商品列表页使用了 `formatPriceWithConversion` 函数，它会：
1. 根据用户 `locale` 检测用户货币（英文环境→USD，中文环境→CNY）
2. 将商品价格从商品货币转换为用户货币
3. 使用正确的货币符号格式化显示

### 修复思路

在商品详情页引入相同的货币处理逻辑：
1. 导入 `formatPriceWithConversion` 和 `detectCurrency` 函数
2. 根据 `locale` 检测用户货币
3. 使用 `formatPriceWithConversion` 格式化价格显示
4. 替换所有硬编码的 `¥` 符号

---

## 📝 详细修复步骤

### 步骤1: 导入必要的函数和类型

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**位置**: 在文件顶部的 import 语句中

**当前导入**（第1-31行）:
```typescript
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Flag, Star, Repeat2, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
// ... 其他导入
import { getLocalizedColorName } from '@/lib/constants/colors'
import type { Product } from '@/lib/types/api'
```

**添加以下导入**:
```typescript
// ✅ 添加：导入货币格式化函数
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
```

---

### 步骤2: 添加用户货币和格式化价格的计算

**位置**: 在 `ProductPageClient` 函数内部，其他 useMemo 钩子附近

**当前代码**（大约在第70-86行）:
```typescript
// 翻译辅助函数
const getLocalizedContent = (
  content: string | null | undefined,
  contentTranslated: string | null | undefined
): string => {
  return getDisplayContent(
    locale,
    product.content_lang || null,
    content,
    contentTranslated
  )
}

// 计算各字段的显示值
const displayName = getLocalizedContent(product.name, product.name_translated)
const displayDescription = getLocalizedContent(product.description, product.description_translated)
const displayDetails = getLocalizedContent(product.details, product.details_translated)
```

**在这些代码之后添加**:
```typescript
// ✅ 添加：根据用户语言环境检测货币
const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])

// ✅ 添加：格式化价格显示（根据用户货币自动转换和显示）
const priceDisplay = useMemo(
  () => formatPriceWithConversion(product.price, product.currency as Currency, userCurrency),
  [product.price, product.currency, userCurrency]
)

// ✅ 添加：格式化运费显示
const shippingFeeDisplay = useMemo(
  () => formatPriceWithConversion(product.shipping_fee || 0, product.currency as Currency, userCurrency),
  [product.shipping_fee, product.currency, userCurrency]
)
```

**注意**: 需要在文件顶部导入 `useMemo`（如果还没导入的话）:
```typescript
import { useState, useEffect, useRef, useMemo } from 'react'
```

---

### 步骤3: 修复主价格显示

**位置**: 第372行

**当前代码**:
```typescript
<p className="text-2xl md:text-3xl font-bold text-primary">
  ¥{product.price.toFixed(2)}
</p>
```

**修改为**:
```typescript
<p className="text-2xl md:text-3xl font-bold text-primary">
  {priceDisplay.main}  // ✅ 使用格式化后的价格显示
</p>
```

---

### 步骤4: 修复运费显示

**位置**: 第426行

**当前代码**:
```typescript
<p className="mb-2 text-sm text-muted-foreground">
  {t('shippingFee')}: ¥{product.shipping_fee.toFixed(2)}
</p>
```

**修改为**:
```typescript
<p className="mb-2 text-sm text-muted-foreground">
  {t('shippingFee')}: {shippingFeeDisplay.main}  // ✅ 使用格式化后的运费显示
</p>
```

---

### 步骤5: 修复价格变动警告消息

**位置1**: 第159行（在 `handleAddToCart` 函数中）

**当前代码**:
```typescript
showWarning(`商品价格已更新为 ¥${currentProduct.price.toFixed(2)}，请刷新页面后重试`)
```

**修改为**:
```typescript
const formattedPrice = formatPriceWithConversion(currentProduct.price, product.currency as Currency, userCurrency)
showWarning(`商品价格已更新为 ${formattedPrice.main}，请刷新页面后重试`)
```

**位置2**: 第220行（在 `handleBuyNow` 函数中）

**当前代码**:
```typescript
showWarning(`商品价格已更新为 ¥${currentProduct.price.toFixed(2)}，请刷新页面后重试`)
```

**修改为**:
```typescript
const formattedPrice = formatPriceWithConversion(currentProduct.price, product.currency as Currency, userCurrency)
showWarning(`商品价格已更新为 ${formattedPrice.main}，请刷新页面后重试`)
```

---

## 📋 完整修复代码示例

### 1. Import 部分

```typescript
import { useState, useEffect, useRef, useMemo } from 'react'  // ✅ 确保包含 useMemo
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Flag, Star, Repeat2, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cartStore'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ReportDialog } from '@/components/social/ReportDialog'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { ProductLikeButton } from '@/components/ecommerce/ProductLikeButton'
import { ProductWantButton } from '@/components/ecommerce/ProductWantButton'
import { ProductFavoriteButton } from '@/components/ecommerce/ProductFavoriteButton'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIsFavorite, useToggleFavorite } from '@/lib/hooks/useFavorites'
import { useRepost } from '@/lib/hooks/useRepost'
import { useRecordView } from '@/lib/hooks/useViewHistory'
import { showInfo, showSuccess, showError, showWarning } from '@/lib/utils/toast'
import { useTranslations, useLocale } from 'next-intl'
import { ChatButton } from '@/components/social/ChatButton'
import { SellerFeedback } from '@/components/ecommerce/SellerFeedback'
import { ProductDetailsTabs } from '@/components/ecommerce/ProductDetailsTabs'
import { ProductReviewForm } from '@/components/ecommerce/ProductReviewForm'
import { ProductReviewSection } from '@/components/ecommerce/ProductReviewSection'
import { ProductCommentSection } from '@/components/ecommerce/ProductCommentSection'
import { initializeAffiliateAttribution } from '@/lib/utils/affiliate-attribution'
import { getCountryDisplayName, SALES_COUNTRIES } from '@/lib/constants/sales-countries'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { getLocalizedColorName } from '@/lib/constants/colors'
import type { Product } from '@/lib/types/api'

// ✅ 添加：导入货币格式化函数
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
```

### 2. 货币计算逻辑

```typescript
export function ProductPageClient({ product, user: initialUser, translations }: ProductPageClientProps) {
  const router = useRouter()
  const productId = product.id
  const addItem = useCartStore((state) => state.addItem)
  const [adding, setAdding] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedColorImage, setSelectedColorImage] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('seller')
  const locale = useLocale()

  // 翻译辅助函数
  const getLocalizedContent = (
    content: string | null | undefined,
    contentTranslated: string | null | undefined
  ): string => {
    return getDisplayContent(
      locale,
      product.content_lang || null,
      content,
      contentTranslated
    )
  }

  // 计算各字段的显示值
  const displayName = getLocalizedContent(product.name, product.name_translated)
  const displayDescription = getLocalizedContent(product.description, product.description_translated)
  const displayDetails = getLocalizedContent(product.details, product.details_translated)

  // ✅ 添加：根据用户语言环境检测货币
  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])

  // ✅ 添加：格式化价格显示（根据用户货币自动转换和显示）
  const priceDisplay = useMemo(
    () => formatPriceWithConversion(product.price, product.currency as Currency, userCurrency),
    [product.price, product.currency, userCurrency]
  )

  // ✅ 添加：格式化运费显示
  const shippingFeeDisplay = useMemo(
    () => formatPriceWithConversion(product.shipping_fee || 0, product.currency as Currency, userCurrency),
    [product.shipping_fee, product.currency, userCurrency]
  )

  // ... 其他代码
}
```

### 3. JSX 中使用

```typescript
{/* 主价格显示 */}
<p className="text-2xl md:text-3xl font-bold text-primary">
  {priceDisplay.main}
</p>

{/* 运费显示 */}
<p className="mb-2 text-sm text-muted-foreground">
  {t('shippingFee')}: {shippingFeeDisplay.main}
</p>
```

---

## 🎯 修复效果

### 修复前
- 中文页面 (`/zh/product/xxx`): `¥100.00`
- 英文页面 (`/en/product/xxx`): `¥100.00` ❌

### 修复后
- 中文页面 (`/zh/product/xxx`): `¥100.00` ✅
- 英文页面 (`/en/product/xxx`): `$100.00` ✅

### 支持的其他货币
根据用户语言环境自动显示：
- 中文 (zh): `¥100.00` (CNY)
- 英文 (en): `$100.00` (USD)
- 日文 (ja): `¥10,000` (JPY)
- 韩文 (ko): `₩100,000` (KRW)
- 欧元地区: `100,00 €` (EUR)
- 英镑地区: `£100.00` (GBP)

---

## ✅ 验证测试

### 测试步骤

1. **中文页面测试**
   ```
   访问: http://localhost:3000/zh/product/266c742e-c4ed-420a-95f9-3531f847d306
   预期: 价格显示 ¥ 符号（如 ¥100.00）
   ```

2. **英文页面测试**
   ```
   访问: http://localhost:3000/en/product/266c742e-c4ed-420a-95f9-3531f847d306
   预期: 价格显示 $ 符号（如 $100.00）
   ```

3. **价格变动警告测试**
   - 在另一个浏览器窗口修改商品价格
   - 在当前页面尝试加入购物车
   - 预期: 警告消息中的价格应显示正确的货币符号

4. **运费显示测试**
   - 检查运费是否根据语言环境显示正确的货币符号

---

## ⚠️ 注意事项

1. **汇率换算**: `formatPriceWithConversion` 会自动将商品价格从商品货币转换为用户货币（基于预设汇率），但**结算时仍以商品货币为准**。

2. **货币检测**: `detectCurrency` 根据 `locale` 检测用户货币：
   - `locale === 'zh'` → CNY
   - `locale === 'en'` → USD
   - 其他语言 → 默认 USD

3. **TypeScript 类型**: 确保 `product.currency` 被断言为 `Currency` 类型。

4. **测试覆盖**: 建议测试多种货币组合（商品货币 vs 用户货币）。

---

## 🔧 后续优化建议

1. **用户偏好货币**: 可以考虑将用户偏好的货币保存到用户设置中，而不是仅根据语言环境检测。

2. **实时汇率**: 当前使用的是预设汇率，可以考虑接入实时汇率 API。

3. **货币选择器**: 可以在页面上添加货币切换器，让用户手动选择显示货币。

4. **价格格式化国际化**: 不同地区对千分位、小数点的使用习惯不同，当前已正确处理。

---

*文档创建时间*: 2026-02-08
*适用版本*: Stratos v0.1.1
*预计修复时间*: 10分钟
*状态*: 待实施
