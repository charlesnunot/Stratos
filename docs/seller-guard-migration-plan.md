# 统一使用 useSellerGuard 实施计划

## 1. 概述

将 `/seller/products/create` 页面的鉴权逻辑从分散式自定义检查统一为使用 `useSellerGuard`，与项目中其他卖家页面保持一致。

---

## 2. ✅ 优点

### 2.1 统一化鉴权逻辑
通过统一使用 `useSellerGuard`，解决了不同页面使用不同鉴权逻辑的问题，这样不仅增强了代码的一致性，还便于后续的维护和扩展。

### 2.2 简化逻辑和减少冗余
清理了大量冗余的鉴权逻辑（约 100 行代码），使代码更加简洁和易于理解，降低了出错的概率。

### 2.3 性能优化
- 使用 Context（如 `useSubscription`）缓存了订阅状态，避免了重复查询数据库，提高了性能
- 对于商品数量限制的 API 请求，使用 `useQuery` 配合缓存策略（如 `staleTime` 和 `cacheTime`）减少不必要的请求，优化了性能

### 2.4 代码结构清晰
通过分阶段的实现，使得每一部分都可以逐步完成，并且能有效避免潜在的风险。最终的代码结构也非常清晰，符合现代 React 开发的最佳实践。

---

## 3. ⚠️ 需要关注的问题

### 3.1 重定向行为的变化

**问题**: 在页面中，可能会有自定义的重定向逻辑，特别是针对未授权用户的处理。如果 `useSellerGuard` 处理了这些逻辑，可能会影响到现有的行为。

**解决方案**: 在 `useSellerGuard` 中提供 `redirectTo` 和 `onUnauthorized` 等选项，确保可以根据需要定制跳转逻辑。这样能够保证不同页面的需求能够灵活适配。

### 3.2 商品数量限制 API 的同步与性能

**问题**: 商品数量限制的 API 请求是动态的，且可能会带来延迟，影响用户体验。

**解决方案**: 
- 增加缓存机制，使用 `useQuery` 的 `staleTime` 和 `cacheTime` 配置来减少重复请求
- 通过本地缓存来减轻每次页面加载的等待时间

### 3.3 支付账户检查组件的重用性

**问题**: `PaymentAccountBanner` 组件已集成支付账户状态的检查，但不同页面的需求可能有所不同。

**解决方案**: 使 `PaymentAccountBanner` 更加灵活，接受更多的配置选项，便于不同场景下的重用。例如，支持显示或隐藏某些状态信息，或者在某些场景下不进行跳转等。

### 3.4 allowed 状态的处理

**问题**: 当前当 `allowed` 为 `false` 时，页面直接返回 `null`，用户无法获得明确的错误信息或提示。

**解决方案**: 在 `allowed` 为 `false` 时，提供更加友好的用户提示，告知用户为何无法访问该页面，并提供适当的引导（例如链接到相关页面）。

---

## 4. 💡 优化建议

### 4.1 增强 useSellerGuard

#### 重定向时机
考虑在 `useSellerGuard` 内部暴露 `isRedirecting` 状态，帮助开发人员处理更复杂的重定向逻辑。例如，可以在用户未授权时先显示加载状态，确保页面体验一致。

#### 允许自定义的跳转路径
通过 `redirectTo` 参数允许开发者自定义跳转的目标页面，使得不同页面的重定向行为更加灵活。

**示例**:
```typescript
interface UseSellerGuardOptions {
  redirectTo?: string;
  onUnauthorized?: () => void;
}

export function useSellerGuard(options?: UseSellerGuardOptions): UseSellerGuardResult
```

### 4.2 商品数量限制 API 性能优化

使用 `useQuery` 配置 `staleTime` 和 `cacheTime`，通过合理的缓存策略优化 API 请求，减少不必要的重复请求。

**示例**:
```typescript
const { data: productLimitInfo } = useQuery({
  queryKey: ['productLimit'],
  queryFn: () => fetch('/api/seller/product-limit').then(r => r.json()),
  enabled: allowed,
  staleTime: 5 * 60 * 1000, // 5分钟缓存
  cacheTime: 10 * 60 * 1000, // 10分钟缓存
})
```

### 4.3 PaymentAccountBanner 组件配置化

让 `PaymentAccountBanner` 更具配置性，允许传递更多的参数来控制其显示内容，例如是否显示支付失败的详细信息，或者是否允许跳转到支付页面。

**示例**:
```typescript
interface PaymentAccountBannerProps {
  status: PaymentAccountStatus | null | undefined;
  isLoading: boolean;
  namespace: 'seller' | 'affiliate' | 'tipCenter';
  showWhenBound?: boolean;
  // 新增配置项
  showDetails?: boolean;
  allowRedirect?: boolean;
  customMessage?: string;
}
```

### 4.4 友好的错误提示

在 `allowed` 为 `false` 时，展示一个友好的提示页面，告知用户无法访问该页面的原因，并提供进一步的操作建议（例如申请成为卖家等）。

**示例**:
```typescript
if (!allowed) {
  return (
    <UnauthorizedPage
      title="需要卖家权限"
      description="您需要成为卖家才能创建商品"
      actionLabel="申请成为卖家"
      actionHref="/subscription/seller"
    />
  )
}
```

---

## 5. 实施阶段

### 阶段 1: 替换基础鉴权

**文件**: `src/app/[locale]/(main)/seller/products/create/page.tsx`

| 步骤 | 变更 | 说明 |
|------|------|------|
| 1 | 导入 `useSellerGuard` | 替换 `useAuth` |
| 2 | 使用 `const { user, loading, isSeller, allowed } = useSellerGuard()` | 统一获取鉴权状态 |
| 3 | 删除 `useAuth` 导入 | 清理代码 |
| 4 | 添加 `SellerGate` 包裹或早期返回 | 未授权时不渲染表单 |

### 阶段 2: 简化订阅检查

**当前**: 页面内手动查询 `profiles` 表检查 `seller_subscription_active`

**改为**: 使用 `useSubscription` Context 提供的数据

```typescript
// 当前（约 80 行）
const { data: profile } = await supabase.from('profiles').select('...')
const hasActiveSubscription = profile.seller_subscription_active === true

// 改为
const { isSeller, isDirectSeller, sellerTier } = useSubscription()
// isSeller 已经包含订阅状态检查
```

### 阶段 3: 保留业务检查

以下检查需要保留，但使用 Context 数据：

| 检查项 | 当前方式 | 建议方式 |
|--------|----------|----------|
| 支付账户状态 | 页面内查询 | 使用 `PaymentAccountBanner` 组件 |
| 商品数量限制 | `/api/seller/product-limit` | 保留 API 调用（动态数据）+ 增加缓存 |

### 阶段 4: 清理冗余代码

删除以下冗余状态和方法：
- `hasSellerSubscription` state
- `checkingSubscription` state  
- `checkSellerSubscription` useEffect
- 手动登录检查 useEffect

---

## 6. 预期代码结构

```typescript
'use client'

import { useSellerGuard } from '@/lib/hooks/useSellerGuard'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { PaymentAccountBanner } from '@/components/payment/PaymentAccountBanner'
import { useQuery } from '@tanstack/react-query'
// ... 其他导入

export default function CreateProductPage() {
  const { user, loading, allowed } = useSellerGuard()
  const { isDirectSeller } = useSubscription()
  const router = useRouter()
  
  // 保留：商品数量限制检查（动态数据）+ 缓存优化
  const { data: productLimitInfo, isLoading: isLoadingLimit } = useQuery({
    queryKey: ['productLimit'],
    queryFn: () => fetch('/api/seller/product-limit').then(r => r.json()),
    enabled: allowed,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  })

  // Hard Render Gate: 加载中
  if (loading) {
    return <LoadingSpinner />
  }

  // Hard Render Gate: 未授权 - 友好提示
  if (!allowed) {
    return (
      <UnauthorizedPage
        title="需要卖家权限"
        description="您需要成为卖家才能创建商品"
        actionLabel="申请成为卖家"
        actionHref="/subscription/seller"
      />
    )
  }

  return (
    <div className="container...">
      {/* 支付账户状态横幅 */}
      <PaymentAccountBanner 
        status={paymentAccountStatus}
        isLoading={isLoadingSellerDetails}
        namespace="seller"
      />
      
      {/* 商品数量限制提示 */}
      {productLimitInfo && !productLimitInfo.canCreate && (
        <ProductLimitAlert info={productLimitInfo} />
      )}
      
      {/* 表单内容 */}
      <ProductForm ... />
    </div>
  )
}
```

---

## 7. 收益

1. **一致性**: 与其他卖家页面使用相同的鉴权模式
2. **简化**: 减少约 100+ 行鉴权相关代码
3. **性能**: 避免重复查询（使用 Context 缓存的数据）
4. **可维护**: 鉴权逻辑集中管理

---

## 8. 风险评估

| 风险 | 缓解措施 |
|------|----------|
| 破坏现有功能 | 保持商品数量限制 API 调用不变 |
| 支付账户检查变化 | `PaymentAccountBanner` 组件已包含该逻辑 |
| 重定向行为变化 | `useSellerGuard` 内部已处理未登录跳转 |
| 性能回归 | 增加 `useQuery` 缓存配置 |

---

## 9. 总结

总体来说，统一使用 `useSellerGuard` 的实施计划非常合理，并且有效地简化了鉴权逻辑、优化了性能和提高了代码的可维护性。关键问题已经考虑周全，提供了合适的解决方案和优化建议。通过这些优化，可以更好地提升用户体验，并确保在不同场景下的灵活性和适应性。
