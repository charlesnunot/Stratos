# 统一鉴权系统实施方案

## 项目背景与目标

### 当前问题
1. **竞态条件问题**: 页面加载完成前点击导航链接（Seller Center/Affiliate Center/Manage Tips）会跳转到错误的订阅页面
2. **鉴权逻辑分散**: 多个组件独立查询订阅状态，导致不一致的行为
3. **冲突的实现**: `useSellerStatus` 有两个不同的实现版本
4. **缺失的守卫**: 缺少 `useAffiliateGuard` 和 `useTipGuard`

### 核心目标
- 统一所有前端组件使用 `useSubscriptionStatus` 钩子
- 确保所有鉴权检查都有 loading 状态处理
- 消除竞态条件，确保 UI 在权限确认后才可交互
- 标准化 Guard 钩子模式

---

## 代码分析发现的问题

### 1. 冲突的 useSellerStatus 实现

**问题**: 项目中存在两个 `useSellerStatus` 实现

| 实现位置 | 状态 | 说明 |
|---------|------|------|
| `src/lib/hooks/useSubscriptionStatus.ts` | ✅ 应该使用 | 统一实现，从 profiles 表获取数据 |
| `src/lib/hooks/useSellerStatus.ts` | ❌ 应该删除 | 独立实现，造成冲突 |

**仍在使用旧实现的文件**:
- `src/app/[locale]/(main)/seller/dashboard/page.tsx`
- `src/app/[locale]/(main)/seller/products/page.tsx`

### 2. 直接查询 profiles 表的组件

以下组件直接查询 `profiles` 表，而不是使用统一钩子：

| 文件 | 查询内容 | 建议 |
|------|---------|------|
| `seller/products/create/page.tsx` | seller_subscription_active, seller_type | 使用 useSellerStatus |
| `seller/deposit/refund/page.tsx` | seller_type | 使用 useSellerStatus |
| `seller/deposit/policy/page.tsx` | seller_type | 使用 useSellerStatus |

### 3. 缺失的 Guard Hooks

**已存在**:
- ✅ `useSellerGuard.tsx` - 已更新使用统一钩子
- ✅ `useAuthGuard.tsx` - 基础认证守卫
- ✅ `useAdminGuard.tsx` - 管理员守卫

**缺失**:
- ❌ `useAffiliateGuard.tsx` - 带货权限守卫
- ❌ `useTipGuard.tsx` - 打赏权限守卫

### 4. 没有权限检查的组件

- `affiliate/products/page.tsx` - 只渲染 AffiliateCenter，没有权限检查
- `AffiliateCenter.tsx` - 只使用 useAuth，没有检查带货订阅状态

---

## 实施计划

### 阶段1: 创建缺失的 Guard Hooks

#### 1.1 创建 `useAffiliateGuard.tsx`

**文件**: `src/lib/hooks/useAffiliateGuard.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useAuth } from './useAuth'
import { useAffiliateStatus } from './useSubscriptionStatus'

interface UseAffiliateGuardOptions {
  redirectTo?: string
  requireAffiliate?: boolean
}

export function useAffiliateGuard(options: UseAffiliateGuardOptions = {}) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { redirectTo = '/subscription/affiliate', requireAffiliate = true } = options
  
  // 使用统一的订阅状态检查钩子
  const { isAffiliate, isLoading: subscriptionLoading } = useAffiliateStatus()

  useEffect(() => {
    const checkAffiliateStatus = () => {
      if (authLoading || subscriptionLoading) return

      if (!user) {
        // 未登录，重定向到登录页
        const loginUrl = `/login?redirect=${encodeURIComponent(pathname)}`
        router.push(loginUrl)
        return
      }

      if (!requireAffiliate) {
        return
      }

      // 检查带货状态
      if (!isAffiliate) {
        router.push(redirectTo)
      }
    }

    checkAffiliateStatus()
  }, [user, authLoading, subscriptionLoading, requireAffiliate, redirectTo, pathname, router, isAffiliate])

  return {
    user,
    loading: authLoading || subscriptionLoading,
    isAuthenticated: !!user,
    isAffiliate,
  }
}
```

#### 1.2 创建 `useTipGuard.tsx`

**文件**: `src/lib/hooks/useTipGuard.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useAuth } from './useAuth'
import { useTipStatus } from './useSubscriptionStatus'

interface UseTipGuardOptions {
  redirectTo?: string
  requireTip?: boolean
}

export function useTipGuard(options: UseTipGuardOptions = {}) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { redirectTo = '/subscription/tip', requireTip = true } = options
  
  // 使用统一的订阅状态检查钩子
  const { isTipEnabled, isLoading: subscriptionLoading } = useTipStatus()

  useEffect(() => {
    const checkTipStatus = () => {
      if (authLoading || subscriptionLoading) return

      if (!user) {
        // 未登录，重定向到登录页
        const loginUrl = `/login?redirect=${encodeURIComponent(pathname)}`
        router.push(loginUrl)
        return
      }

      if (!requireTip) {
        return
      }

      // 检查打赏状态
      if (!isTipEnabled) {
        router.push(redirectTo)
      }
    }

    checkTipStatus()
  }, [user, authLoading, subscriptionLoading, requireTip, redirectTo, pathname, router, isTipEnabled])

  return {
    user,
    loading: authLoading || subscriptionLoading,
    isAuthenticated: !!user,
    isTipEnabled,
  }
}
```

---

### 阶段2: 修改使用旧 useSellerStatus 的文件

#### 2.1 修改 `seller/dashboard/page.tsx`

**当前导入**:
```typescript
import { useSellerStatus, SellerPayoutEligibility } from '@/lib/hooks/useSellerStatus'
```

**修改为**:
```typescript
import { useSellerStatus } from '@/lib/hooks/useSubscriptionStatus'
import { SellerPayoutEligibility } from '@/lib/hooks/useSellerStatus' // 保留枚举定义
```

**修改使用方式**:
```typescript
// 修改前
const { data: sellerStatus, error: sellerStatusError } = useSellerStatus(user?.id)

// 修改后
const { isSeller, isDirectSeller, isLoading: sellerLoading, error: sellerStatusError } = useSellerStatus()

// 修改条件渲染
if (authLoading || sellerLoading) {
  return <LoadingSpinner />
}
```

#### 2.2 修改 `seller/products/page.tsx`

**当前导入**:
```typescript
import { useSellerStatus } from '@/lib/hooks/useSellerStatus'
```

**修改为**:
```typescript
import { useSellerStatus } from '@/lib/hooks/useSubscriptionStatus'
```

**修改使用方式**:
```typescript
// 修改前
const { data: sellerStatus } = useSellerStatus(user.id)

// 修改后
const { isSeller, isLoading: sellerLoading } = useSellerStatus()

// 添加加载状态检查
if (authLoading || sellerLoading) {
  return <LoadingSpinner />
}
```

---

### 阶段3: 修改直接查询 profiles 的组件

#### 3.1 修改 `seller/products/create/page.tsx`

**当前代码** (约第120行):
```typescript
// Check seller subscription status
useEffect(() => {
  const checkSellerSubscription = async () => {
    if (!user) {
      setCheckingSubscription(false)
      return
    }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('seller_subscription_active, payment_provider, payment_account_id, seller_payout_eligibility, seller_type')
        .eq('id', user.id)
        .single()

      if (profile) {
        const hasActiveSubscription = profile.seller_subscription_active === true
        // ...
      }
    }
  }
}, [user])
```

**修改为使用统一钩子**:
```typescript
import { useSellerStatus } from '@/lib/hooks/useSubscriptionStatus'

// 在组件中
const { isSeller, isDirectSeller, isLoading: sellerLoading } = useSellerStatus()

// 修改 useEffect
useEffect(() => {
  if (sellerLoading) return
  
  if (!isSeller) {
    toast({
      variant: 'destructive',
      title: t('needSellerSubscription'),
      description: t('needSellerSubscriptionDescription'),
    })
    router.push('/subscription/seller')
    return
  }
  
  // 继续检查支付账户状态等...
  setCheckingSubscription(false)
}, [isSeller, sellerLoading, router, toast, t])
```

#### 3.2 修改 `seller/deposit/refund/page.tsx`

**当前代码** (约第55-70行):
```typescript
const { data: profile } = useQuery({
  queryKey: ['profile-seller-type', user?.id],
  queryFn: async () => {
    if (!user) return null
    const { data } = await supabase.from('profiles').select('seller_type').eq('id', user.id).single()
    return data as { seller_type?: string } | null
  },
  enabled: !!user,
})
useEffect(() => {
  if (!user || !profile) return
  if ((profile as { seller_type?: string })?.seller_type === 'direct') {
    router.replace('/seller/dashboard')
  }
}, [user, profile, router])
```

**修改为**:
```typescript
import { useSellerStatus } from '@/lib/hooks/useSubscriptionStatus'

// 在组件中
const { isDirectSeller, isLoading: sellerLoading } = useSellerStatus()

useEffect(() => {
  if (sellerLoading) return
  if (isDirectSeller) {
    router.replace('/seller/dashboard')
  }
}, [isDirectSeller, sellerLoading, router])
```

#### 3.3 修改 `seller/deposit/policy/page.tsx`

与 refund 页面类似修改。

---

### 阶段4: 修复竞态条件问题

#### 4.1 已修复: `profile/[id]/page.tsx`

**状态**: ✅ 已完成

**修改内容**:
- 添加 `isLoading` 状态检查
- 在订阅状态确定前禁用导航按钮
- 显示加载状态

#### 4.2 需要检查的其他页面

需要确保以下页面也有 loading 状态处理：

- [ ] `tip-center/page.tsx` - 检查是否处理 loading 状态
- [ ] `affiliate/products/[id]/promote/page.tsx` - 已修改，需要验证
- [ ] `TopBar.tsx` - 已修改，需要验证

---

### 阶段5: 添加 Affiliate 权限检查

#### 5.1 修改 `affiliate/products/page.tsx`

**当前代码**:
```typescript
import { AffiliateCenter } from '@/components/affiliate/AffiliateCenter'

export default function AffiliateProductsPage() {
  return <AffiliateCenter />
}
```

**修改为**:
```typescript
'use client'

import { useAffiliateGuard } from '@/lib/hooks/useAffiliateGuard'
import { AffiliateCenter } from '@/components/affiliate/AffiliateCenter'
import { Loader2 } from 'lucide-react'

export default function AffiliateProductsPage() {
  const { loading } = useAffiliateGuard()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <AffiliateCenter />
}
```

#### 5.2 或者修改 `AffiliateCenter.tsx`

如果不想修改页面，可以在组件内部添加权限检查：

```typescript
import { useAffiliateStatus } from '@/lib/hooks/useSubscriptionStatus'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function AffiliateCenter() {
  const { user } = useAuth()
  const router = useRouter()
  const { isAffiliate, isLoading } = useAffiliateStatus()

  useEffect(() => {
    if (!isLoading && !isAffiliate) {
      router.push('/subscription/affiliate')
    }
  }, [isLoading, isAffiliate, router])

  if (isLoading || !isAffiliate) {
    return <LoadingSpinner />
  }

  // ... 原有代码
}
```

---

### 阶段6: 删除旧实现

#### 6.1 删除 `src/lib/hooks/useSellerStatus.ts`

**前提**: 确认所有文件都已修改为使用 `useSubscriptionStatus`

**操作**:
```bash
rm src/lib/hooks/useSellerStatus.ts
```

**注意**: 如果 `SellerPayoutEligibility` 枚举被其他文件使用，需要：
- 将枚举定义移动到 `useSubscriptionStatus.ts`
- 或创建单独的类型文件

---

### 阶段7: 验证和测试

#### 7.1 验证文件修改清单

**必须修改的文件**:
- [ ] `src/lib/hooks/useAffiliateGuard.tsx` - 新建
- [ ] `src/lib/hooks/useTipGuard.tsx` - 新建
- [ ] `src/app/[locale]/(main)/seller/dashboard/page.tsx` - 修改导入
- [ ] `src/app/[locale]/(main)/seller/products/page.tsx` - 修改导入
- [ ] `src/app/[locale]/(main)/seller/products/create/page.tsx` - 使用统一钩子
- [ ] `src/app/[locale]/(main)/seller/deposit/refund/page.tsx` - 使用统一钩子
- [ ] `src/app/[locale]/(main)/seller/deposit/policy/page.tsx` - 使用统一钩子
- [ ] `src/app/[locale]/(main)/affiliate/products/page.tsx` - 添加权限检查

**需要删除的文件**:
- [ ] `src/lib/hooks/useSellerStatus.ts` - 旧实现

#### 7.2 测试场景

1. **竞态条件测试**
   - 访问 profile 页面
   - 在页面加载完成前快速点击 Seller Center/Affiliate Center/Manage Tips
   - 期望：按钮应处于禁用状态，不会跳转

2. **权限检查测试**
   - 未订阅用户访问卖家页面
   - 期望：重定向到订阅页面

3. **加载状态测试**
   - 所有受保护页面应显示加载状态
   - 加载完成后才显示内容或重定向

4. **统一性测试**
   - 检查所有订阅状态判断逻辑一致
   - 确认都从 profiles 表获取数据

---

## 实施顺序建议

### 阶段1: 准备 (低风险)
1. 创建 `useAffiliateGuard.tsx`
2. 创建 `useTipGuard.tsx`

### 阶段2: 修改组件 (中风险)
3. 修改 `seller/dashboard/page.tsx`
4. 修改 `seller/products/page.tsx`
5. 修改 `seller/products/create/page.tsx`
6. 修改 `seller/deposit/refund/page.tsx`
7. 修改 `seller/deposit/policy/page.tsx`

### 阶段3: 添加权限检查 (中风险)
8. 修改 `affiliate/products/page.tsx`

### 阶段4: 清理 (高风险 - 需要验证)
9. 删除 `src/lib/hooks/useSellerStatus.ts`

### 阶段5: 验证
10. 运行测试
11. 构建项目
12. 验证所有场景

---

## 回滚方案

如果实施出现问题：

1. **恢复被修改的文件**
   ```bash
   git checkout src/app/[locale]/(main)/seller/dashboard/page.tsx
   git checkout src/app/[locale]/(main)/seller/products/page.tsx
   git checkout src/app/[locale]/(main)/seller/products/create/page.tsx
   git checkout src/app/[locale]/(main)/seller/deposit/refund/page.tsx
   git checkout src/app/[locale]/(main)/seller/deposit/policy/page.tsx
   git checkout src/app/[locale]/(main)/affiliate/products/page.tsx
   ```

2. **删除新建的文件**
   ```bash
   rm src/lib/hooks/useAffiliateGuard.tsx
   rm src/lib/hooks/useTipGuard.tsx
   ```

3. **恢复旧实现（如果被删除）**
   ```bash
   git checkout src/lib/hooks/useSellerStatus.ts
   ```

---

## 注意事项

### 1. 类型兼容性
- `useSubscriptionStatus` 返回的 `useSellerStatus` 与旧实现返回类型不同
- 需要检查所有使用点，确保类型兼容

### 2. 加载状态处理
- 所有使用统一钩子的组件都需要处理 `isLoading` 状态
- 确保在 loading 期间显示合适的 UI

### 3. 依赖关系
- 修改顺序很重要，先创建新文件，再修改引用
- 最后才删除旧文件

### 4. 测试覆盖
- 需要测试所有用户角色：普通用户、卖家、带货员、打赏用户、内部用户
- 需要测试所有订阅状态：无订阅、已过期、活跃

---

**文档版本**: 1.0  
**最后更新**: 2026-02-13  
**状态**: 等待审查
