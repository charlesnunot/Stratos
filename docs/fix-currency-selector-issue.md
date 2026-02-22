# 货币选择框问题修复实施方案

## 问题概述

货币下拉选择框存在三个主要问题：
1. **创建页**：货币被反复重置为默认值
2. **编辑页**：加载数据时覆盖用户已编辑的货币
3. **类型定义**：数据库类型缺少 `currency` 字段

---

## 问题根因分析

### 问题1：创建页货币重置

**文件**: `src/app/[locale]/(main)/seller/products/create/page.tsx`

**代码位置**: 第118-165行

**问题代码**:
```typescript
useEffect(() => {
  const checkSellerSubscription = async () => {
    // ... 检查订阅逻辑
    
    if (!authLoading && user) {
      checkSellerSubscription()
      // 每次都设置默认货币
      const defaultCurrency: Currency = locale === 'zh' ? 'CNY' : 'USD'
      setFormData(prev => ({ ...prev, currency: defaultCurrency }))  // ❌ 问题：每次都重置
    }
  }
}, [authLoading, user, router, supabase, toast, locale])  // ❌ 问题：supabase 导致频繁触发
```

**根因**:
- `createClient()` 每次渲染返回新实例
- `supabase` 作为依赖导致 effect 频繁执行
- 没有判断用户是否手动修改过货币

---

### 问题2：编辑页数据覆盖

**文件**: `src/app/[locale]/(main)/seller/products/[id]/edit/page.tsx`

**代码位置**: 第122-207行

**问题代码**:
```typescript
useEffect(() => {
  if (product) {
    // ... 解析数据逻辑
    setFormData({
      // ...
      currency: (product.currency as Currency) || 'USD',  // ❌ 问题：每次都会覆盖
      // ...
    })
  }
}, [product])  // ❌ 问题：product 变化（包括 refetch）都会触发
```

**根因**:
- `useQuery` 默认配置会在窗口聚焦时 refetch
- `useEffect([product])` 每次 product 变化都执行
- 没有区分"初始化加载"和"后续更新"

---

### 问题3：类型定义缺失

**文件**: `src/types/database.ts`

**代码位置**: 第166-240行

**问题**:
- `products.Row` 缺少 `currency: string | null`
- `products.Insert` 缺少 `currency?: string | null`
- `products.Update` 缺少 `currency?: string | null`

---

## 修复实施方案

---

## 阶段一：修复创建页货币重置（优先级：P0）

### 方案A：使用 useRef 标记用户选择（推荐）

#### 步骤1：添加 hasUserSelectedCurrency ref

**文件**: `create/page.tsx`
**位置**: 第98行后

```typescript
// AI Category generation
const { runTask, loading: aiLoading, error: aiError } = useAiTask()
const [aiCategory, setAiCategory] = useState('')
const [isGeneratingCategory, setIsGeneratingCategory] = useState(false)
const categoryGenerationRef = useRef<NodeJS.Timeout | null>(null)

// ✅ 添加：标记用户是否手动选择过货币
const hasUserSelectedCurrency = useRef(false)
```

#### 步骤2：修改货币选择处理

**位置**: 找到货币选择器的 onChange 处理函数

**当前代码**（大约在表单 JSX 部分）:
```typescript
onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value as Currency }))}
```

**修改为**:
```typescript
onChange={(e) => {
  hasUserSelectedCurrency.current = true  // ✅ 标记用户已手动选择
  setFormData(prev => ({ ...prev, currency: e.target.value as Currency }))
}}
```

#### 步骤3：修改 useEffect，条件设置默认货币

**位置**: 第159-165行

**当前代码**:
```typescript
if (!authLoading && user) {
  checkSellerSubscription()
  // Set default currency based on page locale
  const defaultCurrency: Currency = locale === 'zh' ? 'CNY' : 'USD'
  setFormData(prev => ({ ...prev, currency: defaultCurrency }))
}
```

**修改为**:
```typescript
if (!authLoading && user) {
  checkSellerSubscription()
  // ✅ 只在用户未手动选择货币时设置默认值
  if (!hasUserSelectedCurrency.current) {
    const defaultCurrency: Currency = locale === 'zh' ? 'CNY' : 'USD'
    setFormData(prev => ({ ...prev, currency: defaultCurrency }))
  }
}
```

#### 步骤4：移除 supabase 依赖

**位置**: 第165行

**当前代码**:
```typescript
}, [authLoading, user, router, supabase, toast, locale])
```

**修改为**:
```typescript
}, [authLoading, user, router, toast, locale])  // ✅ 移除 supabase
```

---

### 方案B：使用 useMemo 缓存 supabase（备选）

**位置**: 第27行

**当前代码**:
```typescript
const supabase = createClient()
```

**修改为**:
```typescript
const supabase = useMemo(() => createClient(), [])
```

**注意**: 需要在文件顶部导入 useMemo
```typescript
import { useState, useEffect, useRef, useMemo } from 'react'
```

---

## 阶段二：修复编辑页数据覆盖（优先级：P0）

### 方案A：使用 ref 控制只初始化一次（推荐）

#### 步骤1：添加 didInitForm ref

**文件**: `edit/page.tsx`
**位置**: 第81行后

```typescript
// AI Category generation
const { runTask, loading: aiLoading, error: aiError } = useAiTask()
const [aiCategory, setAiCategory] = useState('')
const [isGeneratingCategory, setIsGeneratingCategory] = useState(false)
const categoryGenerationRef = useRef<NodeJS.Timeout | null>(null)

// ✅ 添加：标记表单是否已初始化
const didInitForm = useRef(false)
```

#### 步骤2：修改 useEffect，使用 ref 控制

**位置**: 第122-207行

**当前代码**:
```typescript
useEffect(() => {
  if (product) {
    // ... 解析数据逻辑
    setFormData({
      // ...
      currency: (product.currency as Currency) || 'USD',
      // ...
    })
    // ...
  }
}, [product])
```

**修改为**:
```typescript
useEffect(() => {
  // ✅ 只在首次加载产品数据时初始化表单
  if (product && !didInitForm.current) {
    didInitForm.current = true  // ✅ 标记已初始化
    
    // ... 原有解析数据逻辑保持不变 ...
    
    setFormData({
      // ... 原有字段 ...
      currency: (product.currency as Currency) || 'USD',
      // ... 原有字段 ...
    })
    
    if (product.images) {
      setExistingImages(product.images)
    }
    setAiCategory(product.category || '')
  }
}, [product])
```

---

### 方案B：关闭 useQuery 后台 refetch（备选）

**位置**: 第104-119行

**当前代码**:
```typescript
const { data: product, isLoading: productLoading, error: productError } = useQuery({
  queryKey: ['product', productId],
  queryFn: async () => {
    // ... 原有逻辑
  },
  enabled: !!user && !!productId,
})
```

**修改为**:
```typescript
const { data: product, isLoading: productLoading, error: productError } = useQuery({
  queryKey: ['product', productId],
  queryFn: async () => {
    // ... 原有逻辑
  },
  enabled: !!user && !!productId,
  refetchOnWindowFocus: false,  // ✅ 窗口聚焦时不重新获取
  staleTime: Infinity,          // ✅ 数据永不过期
})
```

---

## 阶段三：修正数据库类型定义（优先级：P1）

### 添加 currency 字段到 products 类型

**文件**: `src/types/database.ts`

#### 步骤1：在 products.Row 中添加 currency

**位置**: 第166-190行（Row 定义内）

**在 `price: number` 后添加**:
```typescript
Row: {
  id: string
  seller_id: string
  name: string
  description: string | null
  price: number
  currency: string | null  // ✅ 添加这一行
  shipping_fee: number
  images: string[]
  stock: number
  // ... 其他字段
}
```

#### 步骤2：在 products.Insert 中添加 currency

**位置**: 第191-215行（Insert 定义内）

**在 `price: number` 后添加**:
```typescript
Insert: {
  id?: string
  seller_id: string
  name: string
  description?: string | null
  price: number
  currency?: string | null  // ✅ 添加这一行
  shipping_fee?: number
  images?: string[]
  stock?: number
  // ... 其他字段
}
```

#### 步骤3：在 products.Update 中添加 currency

**位置**: 第216-240行（Update 定义内）

**在 `price?: number` 后添加**:
```typescript
Update: {
  id?: string
  seller_id?: string
  name?: string
  description?: string | null
  price?: number
  currency?: string | null  // ✅ 添加这一行
  shipping_fee?: number
  images?: string[]
  stock?: number
  // ... 其他字段
}
```

---

## 实施时间表

| 阶段 | 任务 | 文件 | 预计时间 | 优先级 |
|------|------|------|----------|--------|
| 1A | 添加 hasUserSelectedCurrency ref | create/page.tsx | 2分钟 | 🔴 P0 |
| 1B | 修改货币选择处理 | create/page.tsx | 2分钟 | 🔴 P0 |
| 1C | 修改 useEffect 条件 | create/page.tsx | 2分钟 | 🔴 P0 |
| 1D | 移除 supabase 依赖 | create/page.tsx | 1分钟 | 🔴 P0 |
| 2A | 添加 didInitForm ref | edit/page.tsx | 2分钟 | 🔴 P0 |
| 2B | 修改 useEffect 逻辑 | edit/page.tsx | 5分钟 | 🔴 P0 |
| 3 | 添加 currency 到类型定义 | database.ts | 3分钟 | 🟡 P1 |
| 4 | 验证测试 | 浏览器 | 10分钟 | 🟢 P2 |
| **总计** | | | **27分钟** | |

---

## 验证测试方案

### 创建页测试

1. **访问创建页**
   ```
   http://localhost:3000/zh/seller/products/create
   ```

2. **测试步骤**
   - 观察默认货币是否为 CNY
   - 选择非默认货币（如 EUR）
   - 等待几秒，观察货币是否保持 EUR（不应跳回 CNY）
   - 填写其他字段（名称、描述等）
   - 再次确认货币保持 EUR
   - 提交表单

3. **验证数据库**
   ```sql
   SELECT currency FROM products ORDER BY created_at DESC LIMIT 1;
   -- 预期结果: EUR
   ```

### 编辑页测试

1. **访问编辑页**
   ```
   http://localhost:3000/zh/seller/products/[product-id]/edit
   ```

2. **测试步骤**
   - 观察当前货币（如 USD）
   - 修改货币为 GBP
   - 切换浏览器窗口/标签页
   - 等待几秒后返回编辑页
   - 确认货币保持 GBP（不应跳回 USD）
   - 保存表单

3. **验证数据库**
   ```sql
   SELECT currency FROM products WHERE id = '[product-id]';
   -- 预期结果: GBP
   ```

### 类型检查

```bash
npm run typecheck
# 预期：无错误
```

---

## 常见问题排查

### Q1: 修改后货币仍然重置
**可能原因**: useEffect 还有其他依赖导致触发
**排查**: 在 useEffect 开头添加 console.log 查看触发原因

### Q2: 编辑页首次加载不显示数据
**可能原因**: didInitForm ref 在组件卸载后没有重置
**解决**: 在组件卸载时重置 ref（通常不需要，React 会处理）

### Q3: 类型检查仍然报错
**可能原因**: 还有其他地方缺少 currency 类型
**排查**: 全局搜索 `currency` 查看是否还有遗漏

---

## 注意事项

1. **ref 不会触发重新渲染**: useRef 的值变化不会导致组件重新渲染，适合用于标记状态
2. **useMemo 依赖项**: 如果使用 useMemo，注意依赖项设置，避免缓存失效
3. **类型定义同步**: 数据库类型修改后，确保前端代码也同步更新
4. **测试覆盖**: 建议添加单元测试，防止回归

---

## 后续优化建议

1. **使用表单库**: 考虑使用 React Hook Form 管理复杂表单状态
2. **添加防抖**: 货币选择器如果频繁触发，可以添加防抖处理
3. **持久化选择**: 可以将用户货币选择保存到 localStorage，下次自动恢复
4. **类型生成**: 使用 Supabase CLI 自动生成类型定义，避免手动维护

---

*文档创建时间*: 2026-02-08
*适用版本*: Stratos v0.1.1
*预计修复时间*: 27分钟
*状态*: 待实施
