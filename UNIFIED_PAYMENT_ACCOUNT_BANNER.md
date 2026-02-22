# 统一收款账户横幅实施方案

## 目标

统一 `seller/dashboard`、`affiliate/products` 和 `tip-center` 三个页面的收款账户横幅，使用可复用的组件，保持一致的用户体验和代码维护性。

---

## 当前状态分析

| 页面 | 当前实现 | 问题 |
|------|---------|------|
| `/seller/dashboard` | 内联实现，使用 `useSellerStatus` | 代码分散，不可复用 |
| `/affiliate/products` | 内联实现，使用 `usePaymentAccount` | 与 seller 页面逻辑不一致 |
| `/tip-center` | 内联实现，使用 `usePaymentAccount` | 与 seller 页面逻辑不一致 |

**核心问题**：
1. 横幅逻辑分散在三个文件中
2. 代码重复，维护困难
3. 接口定义不一致（`SellerPayoutEligibility` vs `PayoutEligibility`）

---

## 方案设计

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     PaymentAccountBanner                    │
│                    (可复用组件)                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│   Seller     │ │  Affiliate  │ │    Tip     │
│  Dashboard   │ │   Center    │ │   Center   │
└──────────────┘ └─────────────┘ └────────────┘
```

### 优势

1. **代码复用**：一处修改，三处生效
2. **视觉统一**：完全一致的 UI 和交互
3. **易于维护**：集中管理横幅逻辑
4. **类型安全**：统一的接口定义

---

## 实施步骤

### 步骤1：创建可复用的 PaymentAccountBanner 组件

**文件**：`src/components/payment/PaymentAccountBanner.tsx`

```typescript
'use client'

import { Card } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Clock, X, ChevronRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export enum PayoutEligibility {
  ELIGIBLE = 'eligible',
  BLOCKED = 'blocked',
  PENDING_REVIEW = 'pending_review',
}

export interface PaymentAccountStatus {
  hasPaymentAccount: boolean
  paymentProvider: string | null
  eligibility: PayoutEligibility | null
  shouldShowBanner?: boolean
}

interface PaymentAccountBannerProps {
  status: PaymentAccountStatus | null | undefined
  isLoading: boolean
  namespace: 'seller' | 'affiliate' | 'tipCenter'
  showWhenBound?: boolean // 是否在已绑定时也显示（默认true）
}

export function PaymentAccountBanner({ 
  status, 
  isLoading, 
  namespace,
  showWhenBound = true 
}: PaymentAccountBannerProps) {
  const t = useTranslations(namespace)
  
  // 加载中或不显示时不渲染
  if (isLoading || !status) return null
  if (status.shouldShowBanner === false) return null
  
  // 已绑定且正常，且不需要显示时
  if (!showWhenBound && status.hasPaymentAccount && status.eligibility === PayoutEligibility.ELIGIBLE) {
    return null
  }

  // 未绑定收款账户
  if (!status.hasPaymentAccount) {
    return (
      <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
        <Link href="/seller/payment-accounts">
          <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-yellow-900">
                🟡 {t('paymentAccountNotBound')}
              </p>
              <p className="text-xs text-yellow-700">
                {t('paymentAccountNotBoundDesc')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          </div>
        </Link>
      </Card>
    )
  }

  // 收款账户被封禁
  if (status.eligibility === PayoutEligibility.BLOCKED) {
    return (
      <Card className="border-2 border-red-500 bg-red-50 mb-6">
        <Link href="/seller/payment-accounts">
          <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
            <X className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-900">
                🔴 {t('paymentAccountBlocked')}
              </p>
              <p className="text-xs text-red-700">
                {t('paymentAccountBlockedDesc')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-red-600 flex-shrink-0" />
          </div>
        </Link>
      </Card>
    )
  }

  // 收款账户审核中
  if (status.eligibility === PayoutEligibility.PENDING_REVIEW) {
    return (
      <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
        <Link href="/seller/payment-accounts">
          <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
            <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-yellow-900">
                🟡 {t('paymentAccountPending')}
              </p>
              <p className="text-xs text-yellow-700">
                {t('paymentAccountPendingDesc')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          </div>
        </Link>
      </Card>
    )
  }

  // 已绑定且正常
  return (
    <Card className="border-2 border-green-500 bg-green-50 mb-6">
      <div className="flex items-center gap-3 p-4">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-900">
            🟢 {t('paymentAccountActive')}
          </p>
          <p className="text-xs text-green-700">
            {t('paymentAccountActiveDesc')}
          </p>
        </div>
      </div>
    </Card>
  )
}
```

---

### 步骤2：修改 Seller Dashboard

**文件**：`src/app/[locale]/(main)/seller/dashboard/page.tsx`

#### 2.1 添加导入

在文件顶部添加：

```typescript
import { PaymentAccountBanner, PayoutEligibility } from '@/components/payment/PaymentAccountBanner'
```

#### 2.2 删除原有的横幅代码

**删除**第230-288行的原有横幅代码（从 `{/* 收款账户状态横幅 */}` 到 `</Card>`）。

#### 2.3 添加组件调用

在删除的位置添加：

```typescript
      {/* 收款账户状态横幅 */}
      <PaymentAccountBanner 
        status={{
          hasPaymentAccount: paymentAccountStatus?.hasAccount || false,
          paymentProvider: sellerStatus?.paymentProvider || null,
          eligibility: paymentAccountStatus?.eligibility as PayoutEligibility | null,
          shouldShowBanner: sellerStatus?.shouldShowBanner,
        }}
        isLoading={!sellerStatus}
        namespace="seller"
        showWhenBound={true}
      />
```

**注意**：需要确保 `paymentAccountStatus` 和 `sellerStatus` 的数据结构兼容。

如果 `sellerStatus` 中没有 `paymentProvider` 字段，需要修改 `useSellerStatus` hook 或者调整数据结构。

#### 2.4 删除不再使用的导入

如果 `AlertCircle`、`CheckCircle`、`Clock`、`X`、`ChevronRight` 只在横幅中使用，可以从导入中删除。

---

### 步骤3：修改 Affiliate Center

**文件**：`src/components/affiliate/AffiliateCenter.tsx`

#### 3.1 修改导入

**替换**原有的导入：

```typescript
// 删除这行（如果只在横幅中使用）
// import { AlertCircle, CheckCircle, Clock, X, ChevronRight } from 'lucide-react'

// 添加这行
import { PaymentAccountBanner } from '@/components/payment/PaymentAccountBanner'
```

#### 3.2 删除 renderPaymentAccountBanner 函数

**删除**第275-357行的 `renderPaymentAccountBanner` 函数定义。

#### 3.3 替换组件调用

**替换**第361行的调用：

```typescript
// 删除这行
{renderPaymentAccountBanner()}

// 替换为
<PaymentAccountBanner 
  status={paymentAccount}
  isLoading={paymentAccountLoading}
  namespace="affiliate"
  showWhenBound={true}
/>
```

#### 3.4 更新 usePaymentAccount hook（如果需要）

如果 `usePaymentAccount` 返回的数据结构不兼容，需要更新。

**文件**：`src/lib/hooks/usePaymentAccount.ts`

确保接口定义一致：

```typescript
export interface PaymentAccountStatus {
  hasPaymentAccount: boolean
  paymentProvider: string | null
  eligibility: PayoutEligibility | null
  shouldShowBanner?: boolean
}
```

---

### 步骤4：修改 Tip Center

**文件**：`src/app/[locale]/(main)/tip-center/page.tsx`

#### 4.1 修改导入

**替换**原有的导入：

```typescript
// 删除这行（如果只在横幅中使用）
// import { AlertCircle, CheckCircle, Clock, X, ChevronRight } from 'lucide-react'

// 添加这行
import { PaymentAccountBanner } from '@/components/payment/PaymentAccountBanner'
```

#### 4.2 删除 renderPaymentAccountBanner 函数

**删除**第83-165行的 `renderPaymentAccountBanner` 函数定义。

#### 4.3 替换组件调用

**替换**第169行的调用：

```typescript
// 删除这行
{renderPaymentAccountBanner()}

// 替换为
<PaymentAccountBanner 
  status={paymentAccount}
  isLoading={paymentAccountLoading}
  namespace="tipCenter"
  showWhenBound={true}
/>
```

---

### 步骤5：更新 usePaymentAccount Hook

**文件**：`src/lib/hooks/usePaymentAccount.ts`

确保接口和组件一致：

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// 从组件导入统一的枚举和接口
export { PayoutEligibility } from '@/components/payment/PaymentAccountBanner'
export type { PaymentAccountStatus } from '@/components/payment/PaymentAccountBanner'

// 为了保持向后兼容，保留旧的枚举定义
export enum PayoutEligibility {
  ELIGIBLE = 'eligible',
  BLOCKED = 'blocked',
  PENDING_REVIEW = 'pending_review',
}

export interface PaymentAccountStatus {
  hasPaymentAccount: boolean
  paymentProvider: string | null
  eligibility: PayoutEligibility | null
  shouldShowBanner?: boolean
}

export function usePaymentAccount(userId: string | undefined) {
  return useQuery({
    queryKey: ['paymentAccount', userId],
    queryFn: async (): Promise<PaymentAccountStatus | null> => {
      if (!userId) return null

      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          payment_provider,
          payment_account_id,
          seller_payout_eligibility
        `)
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Failed to fetch payment account:', error)
        throw error
      }

      return {
        hasPaymentAccount: !!(data.payment_provider && data.payment_account_id),
        paymentProvider: data.payment_provider,
        eligibility: data.seller_payout_eligibility as PayoutEligibility | null,
        shouldShowBanner: true, // 默认总是显示
      }
    },
    enabled: !!userId,
  })
}
```

---

### 步骤6：更新 useSellerStatus Hook（可选）

**文件**：`src/lib/hooks/useSellerStatus.ts`

如果希望 seller dashboard 也能使用统一的组件，需要确保接口兼容：

```typescript
// 可选：添加 shouldShowBanner 字段
export interface SellerStatus {
  isDirectSeller: boolean
  hasActiveSubscription: boolean
  hasPaymentAccount: boolean
  eligibility: SellerPayoutEligibility | null
  shouldShowBanner: boolean
  paymentProvider?: string | null // 新增
}

// 在 queryFn 中返回
return {
  isDirectSeller: data.seller_type === 'direct',
  hasActiveSubscription: data.seller_subscription_active === true,
  hasPaymentAccount: !!(data.payment_provider && data.payment_account_id),
  eligibility: data.seller_payout_eligibility as SellerPayoutEligibility | null,
  shouldShowBanner: data.seller_type === 'direct' || data.seller_subscription_active === true,
  paymentProvider: data.payment_provider, // 新增
}
```

---

## 可选配置

### 配置1：控制横幅显示时机

通过 `showWhenBound` 属性控制：

```typescript
// 总是显示（包括已绑定状态）
<PaymentAccountBanner 
  showWhenBound={true}
/>

// 只在异常时显示（未绑定、审核中、封禁）
<PaymentAccountBanner 
  showWhenBound={false}
/>
```

**建议**：
- **Seller Dashboard**：使用 `showWhenBound={true}`，让用户知道收款账户状态
- **Affiliate/Tip Center**：可以选择 `showWhenBound={false}`，减少页面占用

---

## 翻译键检查清单

确保以下翻译键存在于各个命名空间中：

### seller 命名空间
```json
{
  "paymentAccountNotBound": "未绑定收款账户",
  "paymentAccountNotBoundDesc": "请先绑定收款账户才能接收买家付款",
  "paymentAccountBlocked": "收款账户已被封禁",
  "paymentAccountBlockedDesc": "您的收款账户因违规或风险被平台封禁",
  "paymentAccountPending": "收款账户审核中",
  "paymentAccountPendingDesc": "您的收款账户正在审核中，请耐心等待",
  "paymentAccountActive": "收款账户正常",
  "paymentAccountActiveDesc": "您的收款账户已激活，可以正常接收买家付款"
}
```

### affiliate 命名空间
```json
{
  "paymentAccountNotBound": "未绑定收款账户",
  "paymentAccountNotBoundDesc": "请先绑定收款账户才能接收佣金",
  "paymentAccountBlocked": "收款账户已被封禁",
  "paymentAccountBlockedDesc": "您的收款账户因违规或风险被平台封禁",
  "paymentAccountPending": "收款账户审核中",
  "paymentAccountPendingDesc": "您的收款账户正在审核中，请耐心等待",
  "paymentAccountActive": "收款账户正常",
  "paymentAccountActiveDesc": "您的收款账户已激活，可以正常接收佣金"
}
```

### tipCenter 命名空间
```json
{
  "paymentAccountNotBound": "未绑定收款账户",
  "paymentAccountNotBoundDesc": "请先绑定收款账户才能接收打赏",
  "paymentAccountBlocked": "收款账户已被封禁",
  "paymentAccountBlockedDesc": "您的收款账户因违规或风险被平台封禁",
  "paymentAccountPending": "收款账户审核中",
  "paymentAccountPendingDesc": "您的收款账户正在审核中，请耐心等待",
  "paymentAccountActive": "收款账户正常",
  "paymentAccountActiveDesc": "您的收款账户已激活，可以正常接收打赏"
}
```

---

## 验证清单

实施完成后，验证以下场景：

### 功能验证

| 场景 | 期望结果 | 验证页面 |
|------|---------|---------|
| 未绑定收款账户 | 显示黄色警告横幅，文案正确 | seller/affiliate/tip |
| 审核中 | 显示黄色等待横幅，文案正确 | seller/affiliate/tip |
| 封禁 | 显示红色错误横幅，文案正确 | seller/affiliate/tip |
| 正常 | 显示绿色成功横幅，文案正确 | seller/affiliate/tip |
| 点击横幅 | 跳转到 `/seller/payment-accounts` | seller/affiliate/tip |
| 加载中 | 不显示横幅 | seller/affiliate/tip |

### 代码验证

- [ ] 组件能正确导入，无类型错误
- [ ] 三个页面使用相同的组件
- [ ] 删除的代码不再存在
- [ ] 翻译键正确显示

---

## 常见问题

### Q1: 为什么要创建独立的组件？

**A**: 
1. **代码复用**：三处使用同一组件，避免重复代码
2. **维护方便**：修改一处，三处生效
3. **视觉统一**：确保完全一致的 UI 和交互
4. **类型安全**：统一的接口定义

### Q2: Seller Dashboard 使用 `useSellerStatus`，其他页面使用 `usePaymentAccount`，如何统一？

**A**: 
- `PaymentAccountBanner` 组件接收通用的 `PaymentAccountStatus` 接口
- 在 seller dashboard 中将 `SellerStatus` 转换为 `PaymentAccountStatus`
- 或者修改 `useSellerStatus` 返回兼容的接口

### Q3: 如果后续需要修改横幅样式，怎么改？

**A**: 
- 只需修改 `PaymentAccountBanner.tsx` 一处
- 三个页面自动生效
- 无需逐个文件修改

### Q4: 是否需要在路由守卫中添加收款账户检查？

**A**: 
- **不需要**。收款账户不是阻止访问页面的条件
- 只需要在页面内提示用户即可
- 用户应该可以正常访问页面，只是会收到横幅提醒

---

## 回滚方案

如果需要回滚修改：

1. 删除 `src/components/payment/PaymentAccountBanner.tsx` 文件
2. 恢复三个页面的原有横幅代码（从 git 历史记录中恢复）
3. 恢复 `usePaymentAccount.ts` 到修改前版本
4. 恢复 `useSellerStatus.ts` 到修改前版本（如果修改过）

---

## 预期效果

实施完成后，三个页面的收款账户横幅将完全一致：

### 未绑定状态
```
┌─────────────────────────────────────────────────────┐
│ ⚠️ 未绑定收款账户                                    │
│ 请先绑定收款账户才能接收佣金/打赏                    │
│                                            [>]      │
└─────────────────────────────────────────────────────┘
```

### 正常状态
```
┌─────────────────────────────────────────────────────┐
│ ✅ 收款账户正常                                      │
│ 您的收款账户已激活，可以正常接收佣金/打赏            │
└─────────────────────────────────────────────────────┘
```

---

**实施完成！** 按照以上步骤修改后，三个页面将使用完全统一的收款账户横幅组件。
