# Affiliate 和 Tip 页面收款账户检查实施计划

## 目标

让 `/affiliate/products` 和 `/tip-center` 页面像 `/seller/dashboard` 一样，检查用户是否绑定了收款账户，并在未绑定时显示提示横幅。

---

## 架构分析

### 当前状态

| 页面 | 收款账户检查 | 数据库字段 |
|------|-------------|-----------|
| `/seller/dashboard` | ✅ 有 | `profiles.payment_provider`, `profiles.payment_account_id` |
| `/affiliate/products` | ❌ 无 | 同上 |
| `/tip-center` | ❌ 无 | 同上 |

### 关键发现

1. **共用字段**：所有用户类型（seller/affiliate/tip）使用相同的 `profiles` 表字段存储收款账户
2. **seller 已实现**：已有完整的 `useSellerStatus` hook 和 `SellerPayoutEligibility` 枚举
3. **缺少逻辑**：affiliate 和 tip 页面没有检查收款账户是否绑定

---

## 实施步骤

### 步骤1：创建通用的收款账户检查 Hook

**文件**：`src/lib/hooks/usePaymentAccount.ts`

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export enum PayoutEligibility {
  ELIGIBLE = 'eligible',
  BLOCKED = 'blocked',
  PENDING_REVIEW = 'pending_review',
}

export interface PaymentAccountStatus {
  hasPaymentAccount: boolean
  paymentProvider: string | null
  eligibility: PayoutEligibility | null
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
      }
    },
    enabled: !!userId,
  })
}
```

**注意**：这个 hook 与 `useSellerStatus` 类似，但更通用，不区分用户类型。

---

### 步骤2：修改 AffiliateCenter 组件

**文件**：`src/components/affiliate/AffiliateCenter.tsx`

#### 2.1 添加导入

在文件顶部添加：

```typescript
import { usePaymentAccount, PayoutEligibility } from '@/lib/hooks/usePaymentAccount'
import { AlertCircle, CheckCircle, Clock, X, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
```

#### 2.2 在组件内部添加收款账户检查

在 `const { user } = useAuth()` 之后（约第42行）添加：

```typescript
  // 检查收款账户状态
  const { data: paymentAccount, isLoading: paymentAccountLoading } = usePaymentAccount(user?.id)
```

#### 2.3 在 return 语句前添加横幅组件

在 `if (isLoading)` 检查之前（约第256行）添加横幅显示逻辑：

```typescript
  // 显示收款账户状态横幅
  const renderPaymentAccountBanner = () => {
    if (paymentAccountLoading || !paymentAccount) return null

    if (!paymentAccount.hasPaymentAccount) {
      return (
        <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
          <Link href="/seller/payment-accounts">
            <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">
                  {t('paymentAccountNotBound') || '🟡 未绑定收款账户'}
                </p>
                <p className="text-xs text-yellow-700">
                  {t('paymentAccountNotBoundDesc') || '请先绑定收款账户才能接收佣金'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            </div>
          </Link>
        </Card>
      )
    }

    if (paymentAccount.eligibility === PayoutEligibility.BLOCKED) {
      return (
        <Card className="border-2 border-red-500 bg-red-50 mb-6">
          <Link href="/seller/payment-accounts">
            <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
              <X className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">
                  {t('paymentAccountBlocked') || '🔴 收款账户已被封禁'}
                </p>
                <p className="text-xs text-red-700">
                  {t('paymentAccountBlockedDesc') || '您的收款账户因违规或风险被平台封禁'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-red-600 flex-shrink-0" />
            </div>
          </Link>
        </Card>
      )
    }

    if (paymentAccount.eligibility === PayoutEligibility.PENDING_REVIEW) {
      return (
        <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
          <Link href="/seller/payment-accounts">
            <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
              <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">
                  {t('paymentAccountPending') || '🟡 收款账户审核中'}
                </p>
                <p className="text-xs text-yellow-700">
                  {t('paymentAccountPendingDesc') || '您的收款账户正在审核中，请耐心等待'}
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
              {t('paymentAccountActive') || '🟢 收款账户正常'}
            </p>
            <p className="text-xs text-green-700">
              {t('paymentAccountActiveDesc') || '您的收款账户已激活，可以正常接收佣金'}
            </p>
          </div>
        </div>
      </Card>
    )
  }
```

#### 2.4 在页面内容前插入横幅

在 `return (` 后的第一个 `<div className="space-y-6">` 内，在标题之前插入：

```typescript
  return (
    <div className="space-y-6">
      {/* 收款账户状态横幅 */}
      {renderPaymentAccountBanner()}
      
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('affiliateCenter')}</h1>
        ...
```

---

### 步骤3：修改 TipCenter 页面

**文件**：`src/app/[locale]/(main)/tip-center/page.tsx`

#### 3.1 添加导入

在文件顶部添加：

```typescript
import { usePaymentAccount, PayoutEligibility } from '@/lib/hooks/usePaymentAccount'
import { AlertCircle, CheckCircle, Clock, X, ChevronRight } from 'lucide-react'
```

#### 3.2 在组件内部添加收款账户检查

在 `const { isTipEnabled } = useTipStatus()` 之后（约第26行）添加：

```typescript
  // 检查收款账户状态
  const { data: paymentAccount, isLoading: paymentAccountLoading } = usePaymentAccount(user?.id)
```

#### 3.3 创建横幅渲染函数

在组件内部添加（在 `// 获取货币符号` 之前）：

```typescript
  // 显示收款账户状态横幅
  const renderPaymentAccountBanner = () => {
    if (paymentAccountLoading || !paymentAccount) return null

    if (!paymentAccount.hasPaymentAccount) {
      return (
        <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
          <Link href="/seller/payment-accounts">
            <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">
                  {t('paymentAccountNotBound') || '🟡 未绑定收款账户'}
                </p>
                <p className="text-xs text-yellow-700">
                  {t('paymentAccountNotBoundDesc') || '请先绑定收款账户才能接收打赏'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            </div>
          </Link>
        </Card>
      )
    }

    if (paymentAccount.eligibility === PayoutEligibility.BLOCKED) {
      return (
        <Card className="border-2 border-red-500 bg-red-50 mb-6">
          <Link href="/seller/payment-accounts">
            <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
              <X className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">
                  {t('paymentAccountBlocked') || '🔴 收款账户已被封禁'}
                </p>
                <p className="text-xs text-red-700">
                  {t('paymentAccountBlockedDesc') || '您的收款账户因违规或风险被平台封禁'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-red-600 flex-shrink-0" />
            </div>
          </Link>
        </Card>
      )
    }

    if (paymentAccount.eligibility === PayoutEligibility.PENDING_REVIEW) {
      return (
        <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
          <Link href="/seller/payment-accounts">
            <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
              <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">
                  {t('paymentAccountPending') || '🟡 收款账户审核中'}
                </p>
                <p className="text-xs text-yellow-700">
                  {t('paymentAccountPendingDesc') || '您的收款账户正在审核中，请耐心等待'}
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
              {t('paymentAccountActive') || '🟢 收款账户正常'}
            </p>
            <p className="text-xs text-green-700">
              {t('paymentAccountActiveDesc') || '您的收款账户已激活，可以正常接收打赏'}
            </p>
          </div>
        </div>
      </Card>
    )
  }
```

#### 3.4 在页面内容前插入横幅

在 `return (` 后的第一个 `<div className="space-y-6">` 内，在标题之前插入：

```typescript
  return (
    <div className="space-y-6">
      {/* 收款账户状态横幅 */}
      {renderPaymentAccountBanner()}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        ...
```

---

### 步骤4：添加翻译键

#### 4.1 中文翻译（messages/zh.json）

在 `admin` 对象内添加（第864行后）：

```json
    "paymentAccountNotBound": "未绑定收款账户",
    "paymentAccountNotBoundDesc": "请先绑定收款账户才能接收佣金/打赏",
    "paymentAccountBlocked": "收款账户已被封禁",
    "paymentAccountBlockedDesc": "您的收款账户因违规或风险被平台封禁",
    "paymentAccountPending": "收款账户审核中",
    "paymentAccountPendingDesc": "您的收款账户正在审核中，请耐心等待",
    "paymentAccountActive": "收款账户正常",
    "paymentAccountActiveDesc": "您的收款账户已激活，可以正常收款",
    "dashboardTitle": "管理员仪表板"
```

#### 4.2 英文翻译（messages/en.json）

在 `admin` 对象内添加（第871行后）：

```json
    "paymentAccountNotBound": "Payment Account Not Bound",
    "paymentAccountNotBoundDesc": "Please bind a payment account to receive commissions/tips",
    "paymentAccountBlocked": "Payment Account Blocked",
    "paymentAccountBlockedDesc": "Your payment account has been blocked due to violations or risks",
    "paymentAccountPending": "Payment Account Pending Review",
    "paymentAccountPendingDesc": "Your payment account is under review, please wait patiently",
    "paymentAccountActive": "Payment Account Active",
    "paymentAccountActiveDesc": "Your payment account is active and ready to receive payments",
    "dashboardTitle": "Admin Dashboard"
```

---

## 界面效果预览

### 未绑定收款账户时

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ 未绑定收款账户                                    │
│ 请先绑定收款账户才能接收佣金/打赏                    │
│                                            [>]      │
└─────────────────────────────────────────────────────┘

[页面其他内容...]
```

### 收款账户审核中时

```
┌─────────────────────────────────────────────────────┐
│ ⏳ 收款账户审核中                                    │
│ 您的收款账户正在审核中，请耐心等待                   │
│                                            [>]      │
└─────────────────────────────────────────────────────┘

[页面其他内容...]
```

### 收款账户被封禁时

```
┌─────────────────────────────────────────────────────┐
│ ❌ 收款账户已被封禁                                  │
│ 您的收款账户因违规或风险被平台封禁                   │
│                                            [>]      │
└─────────────────────────────────────────────────────┘

[页面其他内容...]
```

### 收款账户正常时

```
┌─────────────────────────────────────────────────────┐
│ ✅ 收款账户正常                                      │
│ 您的收款账户已激活，可以正常接收佣金/打赏            │
└─────────────────────────────────────────────────────┘

[页面其他内容...]
```

---

## 验证清单

实施完成后，请验证以下场景：

### Affiliate 页面测试

1. **未绑定收款账户**
   - 访问 `/affiliate/products`
   - 期望：显示黄色警告横幅"未绑定收款账户"
   - 点击横幅跳转到 `/seller/payment-accounts`

2. **已绑定收款账户**
   - 绑定收款账户后刷新页面
   - 期望：显示绿色横幅"收款账户正常"

3. **收款账户审核中**
   - 将数据库中 `seller_payout_eligibility` 改为 `pending_review`
   - 期望：显示黄色横幅"收款账户审核中"

4. **收款账户被封禁**
   - 将数据库中 `seller_payout_eligibility` 改为 `blocked`
   - 期望：显示红色横幅"收款账户已被封禁"

### Tip 页面测试

1. **未绑定收款账户**
   - 访问 `/tip-center`
   - 期望：显示黄色警告横幅"未绑定收款账户"

2. **已绑定收款账户**
   - 绑定收款账户后刷新页面
   - 期望：显示绿色横幅"收款账户正常"

---

## 文件修改清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/lib/hooks/usePaymentAccount.ts` | 新增 | 创建通用的收款账户检查 hook |
| `src/components/affiliate/AffiliateCenter.tsx` | 修改 | 添加收款账户横幅显示 |
| `src/app/[locale]/(main)/tip-center/page.tsx` | 修改 | 添加收款账户横幅显示 |
| `src/messages/zh.json` | 修改 | 添加中文翻译键 |
| `src/messages/en.json` | 修改 | 添加英文翻译键 |

---

## 常见问题

### Q1: 为什么使用 `/seller/payment-accounts` 作为绑定页面？

**A**: 因为当前系统只有卖家有专门的收款账户管理页面。affiliate 和 tip 用户也需要绑定收款账户，复用相同的页面逻辑最简单。

### Q2: 如果用户是内部用户，是否需要检查收款账户？

**A**: 是的，内部用户也需要绑定收款账户才能接收佣金/打赏。平台打款时仍然需要知道打款到哪个账户。

### Q3: 是否需要在订阅页面（/subscription/*）也添加收款账户检查？

**A**: 不需要。订阅页面是用户购买服务的地方，不是接收款项的地方。收款账户检查应该在使用功能接收款项的页面进行。

### Q4: 为什么不在路由守卫中添加收款账户检查？

**A**: 收款账户不是阻止用户访问页面的条件，只是提示用户需要绑定才能收款。用户应该可以正常访问页面，只是会收到横幅提醒。

---

## 回滚方案

如果需要回滚修改：

1. 删除 `src/lib/hooks/usePaymentAccount.ts` 文件
2. 恢复 `src/components/affiliate/AffiliateCenter.tsx` 到修改前版本
3. 恢复 `src/app/[locale]/(main)/tip-center/page.tsx` 到修改前版本
4. 从翻译文件中删除添加的翻译键

---

**实施完成！** 按照以上步骤修改后，affiliate 和 tip 页面将像 seller dashboard 一样显示收款账户状态横幅。
