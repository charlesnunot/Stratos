# 商品详情页面翻译显示问题修复方案

## 问题摘要

当访问英文版商品详情页面（`/en/product/xxx`）时，商品名称、描述、详情、颜色等字段**仍然显示中文**，没有根据当前界面语言自动切换为英文翻译。

**示例URL**: `http://localhost:3000/en/product/266c742e-c4ed-420a-95f9-3531f847d306`

**预期行为**: 在 `/en/` 路径下应显示英文翻译内容  
**实际行为**: 显示中文原文

---

## 根因分析

### 1. 翻译数据已存在

系统已有完整的翻译机制：

**翻译流程**:
```
创建商品（中文）
    ↓
管理员审批通过
    ↓
触发 translate-after-publish API
    ↓
AI 翻译并保存到数据库：
  - name → name_translated
  - description → description_translated  
  - details → details_translated
  - category → category_translated
  - faq → faq_translated
```

### 2. 商品详情页面**未使用翻译字段**

**问题代码位置**:

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

| 行号 | 当前代码 | 问题 |
|------|---------|------|
| 346 | `<h1>{product.name}</h1>` | 直接显示原文 |
| 377 | `<p>{product.description}</p>` | 直接显示原文 |
| 451 | `<span>{colorOption.name}</span>` | 颜色直接显示原文 |
| 569 | `productDetails={product.details}` | 传给子组件的是原文 |
| 570 | `productFaq={product.faq}` | 传给子组件的是原文 |

**根本原因**: 页面组件没有根据当前 `locale` 选择显示原文或译文。

### 3. 对比：商品列表页已正确实现

商品列表/卡片组件使用了 `getDisplayContent` 工具函数（`src/lib/ai/display-translated.ts`）：

```typescript
// src/lib/product-card/mappers.ts
export function mapFeedProductToListProductDTO(raw: RawProduct) {
  return {
    content: {
      name: raw.name || '',
      nameTranslated: raw.name_translated || null,
      descriptionTranslated: raw.description_translated || null,
      // ...
    }
  }
}

// 在组件中使用 getDisplayContent 选择显示内容
```

**但商品详情页没有实现类似逻辑！**

---

## 修复方案

### 方案总览

采用**前端实时翻译**方案，在客户端组件中使用 `getDisplayContent` 函数根据当前 `locale` 动态选择显示内容。

**优点**:
- ✅ 实现简单，无需修改数据结构
- ✅ 语言切换时立即生效（无需刷新页面）
- ✅ 与现有翻译系统兼容

---

## 详细实施计划

### 阶段1：修复主要文本字段（优先级：P0）

**目标**: 修复商品名称、描述、详情、分类的显示

#### 1.1 修改服务端数据获取

**文件**: `src/app/[locale]/(main)/product/[id]/page.tsx`

**修改内容**:

确保查询包含所有翻译字段：

```typescript
// 当前代码（第15-23行）
const { data: product, error } = await supabase
  .from('products')
  .select(`
    *,
    seller:profiles!products_seller_id_fkey(username, display_name)
  `)
  .eq('id', productId)
  .eq('status', 'active')
  .single()

// 修改为显式选择所有字段（包括翻译字段）
const { data: product, error } = await supabase
  .from('products')
  .select(`
    id, name, description, details, category, price, currency, stock, 
    images, status, seller_id, condition, shipping_fee, sales_countries,
    color_options, sizes, faq, allow_affiliate, commission_rate,
    content_lang, 
    name_translated, description_translated, details_translated, 
    category_translated, faq_translated,
    seller:profiles!products_seller_id_fkey(username, display_name)
  `)
  .eq('id', productId)
  .eq('status', 'active')
  .single()
```

#### 1.2 修改客户端组件

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**步骤**:

**A. 导入翻译工具函数**（第1-30行之间添加）:

```typescript
import { getDisplayContent } from '@/lib/ai/display-translated'
```

**B. 创建翻译辅助 hook**（在组件内，第65行后添加）:

```typescript
// 获取当前应显示的内容
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
const displayCategory = getLocalizedContent(product.category, product.category_translated)
```

**C. 替换直接引用为翻译后的值**:

| 位置 | 原代码 | 新代码 |
|------|--------|--------|
| 346行 | `{product.name}` | `{displayName}` |
| 377行 | `{product.description}` | `{displayDescription}` |
| 569行 | `productDetails={product.details}` | `productDetails={displayDetails}` |

#### 1.3 验证要点

- [ ] 访问 `/zh/product/xxx` 显示中文原文
- [ ] 访问 `/en/product/xxx` 显示英文翻译（如果已审核通过并翻译）
- [ ] 语言切换时内容实时更新

**预计时间**: 30分钟

---

### 阶段2：修复 FAQ 翻译（优先级：P1）

**目标**: 修复常见问题数组的翻译显示

#### 2.1 FAQ 数据结构分析

FAQ 是数组结构：
```typescript
faq: Array<{ question: string; answer: string }>
faq_translated: Array<{ question: string; answer: string }> | null
```

#### 2.2 实现 FAQ 翻译逻辑

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**添加 FAQ 翻译处理**（在 `getLocalizedContent` 后添加）:

```typescript
// 处理 FAQ 翻译
const getLocalizedFaq = (): Array<{ question: string; answer: string }> | null => {
  if (!product.faq) return null
  
  const wantZh = locale === 'zh'
  const isZh = product.content_lang === 'zh' || 
    (!product.content_lang && detectContentLanguage(product.faq[0]?.question || '') === 'zh')
  
  // 如果界面语言与原文一致，显示原文
  if (wantZh === isZh) return product.faq
  
  // 否则显示译文
  return product.faq_translated || product.faq
}

const displayFaq = getLocalizedFaq()
```

**注意**: 需要导入 `detectContentLanguage` 或直接使用启发式判断。

#### 2.3 简化方案

如果不使用语言检测，可以简化：

```typescript
const displayFaq = locale === product.content_lang 
  ? product.faq 
  : (product.faq_translated || product.faq)
```

#### 2.4 修改 FAQ 传递

**行570**:
```typescript
// 原代码
productFaq={product.faq as Array<{ question: string; answer: string }> | null}

// 新代码
productFaq={displayFaq}
```

**预计时间**: 20分钟

---

### 阶段3：修复颜色选项翻译（优先级：P2）

**问题**: 颜色选项（color_options）**可能没有翻译机制**！

#### 3.1 现状分析

- 数据库中没有 `color_options_translated` 字段
- `translate-after-publish` API 没有处理颜色选项
- 颜色名称通常是简单的词汇（如"红色"、"蓝色"）

#### 3.2 解决方案对比

**方案A：添加颜色翻译机制**（推荐，长期方案）
- 修改数据库添加 `color_options_translated` 字段
- 修改翻译 API 处理颜色选项
- 修改商品详情页使用翻译后的颜色名

**方案B：使用通用英文颜色名**（快速方案）
- 创建颜色名称映射表（中文→英文）
- 在显示时根据 locale 选择

**方案C：限制颜色名称输入**（简单方案）
- 要求卖家使用英文或通用颜色名
- 前端提供颜色选择器而非自由输入

#### 3.3 推荐实施方案（方案B）

**文件**: `src/lib/constants/colors.ts`（新建）

```typescript
// 颜色名称映射表
export const COLOR_NAME_MAP: Record<string, { zh: string; en: string }> = {
  '红色': { zh: '红色', en: 'Red' },
  '蓝色': { zh: '蓝色', en: 'Blue' },
  '绿色': { zh: '绿色', en: 'Green' },
  '黄色': { zh: '黄色', en: 'Yellow' },
  '黑色': { zh: '黑色', en: 'Black' },
  '白色': { zh: '白色', en: 'White' },
  '灰色': { zh: '灰色', en: 'Gray' },
  '粉色': { zh: '粉色', en: 'Pink' },
  '紫色': { zh: '紫色', en: 'Purple' },
  '橙色': { zh: '橙色', en: 'Orange' },
  '棕色': { zh: '棕色', en: 'Brown' },
  '米色': { zh: '米色', en: 'Beige' },
  '银色': { zh: '银色', en: 'Silver' },
  '金色': { zh: '金色', en: 'Gold' },
}

export function getLocalizedColorName(name: string, locale: string): string {
  const normalized = name.trim()
  const colorEntry = COLOR_NAME_MAP[normalized]
  if (colorEntry) {
    return locale === 'zh' ? colorEntry.zh : colorEntry.en
  }
  // 如果没有找到映射，返回原文
  return normalized
}
```

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**修改颜色显示**（第451行附近）:

```typescript
import { getLocalizedColorName } from '@/lib/constants/colors'

// 在渲染颜色选项时
<span className="text-sm">
  {getLocalizedColorName(colorOption.name, locale)}
</span>
```

#### 3.4 扩展映射表

需要与产品/运营团队确认常用颜色名称，补充完整映射表。

**预计时间**: 40分钟

---

### 阶段4：其他相关字段（优先级：P3）

#### 4.1 尺寸选项（sizes）

尺寸通常是通用符号（S, M, L, XL）或数字，一般不需要翻译。如果包含中文（如"大号"），可以考虑添加映射。

#### 4.2 卖家信息

卖家用户名和显示名通常不翻译，保持原文。

#### 4.3 店铺政策（Policies）

如果商品包含退货政策、配送政策等，也需要确认是否支持翻译。

**预计时间**: 20分钟

---

## 完整代码修改示例

### 修改后的 ProductPageClient.tsx 关键部分

```typescript
'use client'

// ... 其他导入
import { getDisplayContent } from '@/lib/ai/display-translated'
import { getLocalizedColorName } from '@/lib/constants/colors'

export function ProductPageClient({ product, user: initialUser, translations }: ProductPageClientProps) {
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
  
  // 计算各字段显示值
  const displayName = getLocalizedContent(product.name, product.name_translated)
  const displayDescription = getLocalizedContent(product.description, product.description_translated)
  const displayDetails = getLocalizedContent(product.details, product.details_translated)
  const displayCategory = getLocalizedContent(product.category, product.category_translated)
  
  // 处理 FAQ
  const displayFaq = locale === product.content_lang 
    ? product.faq 
    : (product.faq_translated || product.faq)
  
  return (
    <div>
      {/* 商品名称 */}
      <h1>{displayName}</h1>
      
      {/* 商品描述 */}
      <p>{displayDescription}</p>
      
      {/* 颜色选项 */}
      {product.color_options?.map((colorOption: any) => (
        <span>{getLocalizedColorName(colorOption.name, locale)}</span>
      ))}
      
      {/* 商品详情标签页 */}
      <ProductDetailsTabs
        productDetails={displayDetails}
        productFaq={displayFaq}
        // ...
      />
    </div>
  )
}
```

---

## 测试验证清单

### 测试场景1：已翻译商品

**前提**: 商品已通过审批且翻译完成（数据库中有 `_translated` 字段）

**步骤**:
1. 访问 `/zh/product/xxx`
2. 访问 `/en/product/xxx`

**预期结果**:
- [ ] 中文版显示中文原文
- [ ] 英文版显示英文译文
- [ ] 切换语言时内容实时变化

### 测试场景2：未翻译商品

**前提**: 新创建但未审批/翻译的商品

**步骤**:
1. 访问 `/en/product/xxx`

**预期结果**:
- [ ] 显示中文原文（回退机制）
- [ ] 页面正常显示，无错误

### 测试场景3：颜色选项

**步骤**:
1. 创建包含颜色选项的商品（如"红色"、"蓝色"）
2. 访问英文版页面

**预期结果**:
- [ ] 颜色显示为 "Red", "Blue"（通过映射表）
- [ ] 未在映射表中的颜色显示原文

### 测试场景4：边界情况

- [ ] 商品名称为空
- [ ] 描述为空
- [ ] 详情为空
- [ ] FAQ 为空数组
- [ ] content_lang 为空

---

## 风险评估与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| 翻译字段缺失 | 低 | 高 | 添加空值检查，回退到原文 |
| content_lang 不准确 | 中 | 中 | 使用启发式语言检测 |
| 颜色映射不完整 | 高 | 低 | 逐步补充映射表；未匹配时显示原文 |
| FAQ 结构不一致 | 低 | 中 | 添加数据验证和容错处理 |

---

## 实施时间表

| 阶段 | 内容 | 预计时间 | 优先级 |
|------|------|----------|--------|
| 阶段1 | 修复名称/描述/详情/分类 | 30分钟 | P0 🔴 |
| 阶段2 | 修复 FAQ 翻译 | 20分钟 | P1 🟡 |
| 阶段3 | 修复颜色选项翻译 | 40分钟 | P2 🟢 |
| 阶段4 | 其他字段与回归测试 | 30分钟 | P3 ⚪ |
| **总计** | | **约2小时** | |

---

## 相关文件清单

### 需要修改的文件
1. ✅ `src/app/[locale]/(main)/product/[id]/page.tsx` - 添加翻译字段查询
2. ✅ `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx` - 实现翻译显示逻辑
3. ⚠️ `src/components/ecommerce/ProductDetailsTabs.tsx` - 可能需要调整 props 类型
4. ✅ `src/lib/constants/colors.ts` - 新建颜色映射表

### 参考文件
- `src/lib/ai/display-translated.ts` - 翻译显示工具函数
- `src/lib/product-card/mappers.ts` - 商品卡片翻译实现（已正确）
- `src/app/api/ai/translate-after-publish/route.ts` - 翻译 API 逻辑

---

## 后续优化建议

1. **统一翻译 Hook**: 创建 `useProductTranslation(product)` hook，统一处理商品翻译逻辑
2. **服务端渲染优化**: 考虑在服务端完成翻译选择，减少客户端计算
3. **缓存优化**: 翻译结果可以缓存，避免重复计算
4. **颜色选择器**: 前端提供标准化颜色选择器，避免自由输入

---

## 结论

这是一个**实现不完整**的问题，而非数据缺失问题。翻译数据已存在，但详情页面没有使用。

**建议立即实施阶段1修复**（30分钟），即可解决主要问题。

完整修复（阶段1-4）预计需要约2小时。

---

*文档创建时间*: 2026-02-08  
*适用版本*: Stratos v0.1.1  
*状态*: 待实施
