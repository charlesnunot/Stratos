# 订阅页面内部用户拦截实施方案

## 问题概述

当前三个订阅页面（seller/affiliate/tip）对内部用户和直营卖家的拦截逻辑不一致：

| 页面 | 内部用户检查 | 直营卖家检查 | 状态 |
|------|-------------|-------------|------|
| `/subscription/tip` | ✅ 有 | ❌ 无 | 仅检查内部用户 |
| `/subscription/seller` | ❌ 无 | ✅ 有（重定向） | 仅检查直营卖家 |
| `/subscription/affiliate` | ❌ 无 | ❌ 无 | 无任何检查 |

**目标**：统一三个页面的拦截逻辑，内部用户和直营卖家都不需要购买订阅。

## 根因分析

### 关键发现

根据 `set-direct-seller/route.ts` 第33行的限制：

```typescript
if (profile.user_origin !== 'internal') {
  return NextResponse.json(
    { error: 'Only internal users can be set as direct seller via this API' },
    { status: 400 }
  )
}
```

**结论**：直营卖家（`seller_type='direct'`）必定来自内部用户（`user_origin='internal'`），因此**只需检查 `user_origin === 'internal'`** 即可覆盖所有情况。

## 实施方案

### 方案选择：简化检查（推荐）

**理由**：
1. 直营卖家API限制确保只能是内部用户
2. 代码更简洁，维护性更好
3. 三个页面逻辑保持一致

---

## 详细实施步骤

### 步骤1：创建通用Hook（可选但推荐）

**文件**：`src/lib/hooks/useSubscriptionBypassCheck.ts`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

interface UseSubscriptionBypassCheckResult {
  shouldBypass: boolean
  isLoading: boolean
  error: Error | null
}

/**
 * 检查用户是否可以跳过订阅页面
 * 内部用户和直营卖家都不需要购买订阅
 */
export function useSubscriptionBypassCheck(): UseSubscriptionBypassCheckResult {
  const { user, loading: authLoading } = useAuth()
  const [result, setResult] = useState<UseSubscriptionBypassCheckResult>({
    shouldBypass: false,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    const checkBypass = async () => {
      if (authLoading) return
      
      if (!user) {
        setResult({ shouldBypass: false, isLoading: false, error: null })
        return
      }

      try {
        const supabase = createClient()
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('user_origin')
          .eq('id', user.id)
          .single()

        if (error) {
          throw new Error(`Failed to fetch profile: ${error.message}`)
        }

        // 内部用户（包含直营卖家）都不需要订阅
        const shouldBypass = profile?.user_origin === 'internal'
        
        setResult({ shouldBypass, isLoading: false, error: null })
      } catch (err) {
        setResult({
          shouldBypass: false,
          isLoading: false,
          error: err instanceof Error ? err : new Error('Unknown error'),
        })
      }
    }

    checkBypass()
  }, [user, authLoading])

  return result
}
```

---

### 步骤2：修改 Seller 订阅页面

**文件**：`src/app/[locale]/(main)/subscription/seller/page.tsx`

#### 2.1 添加导入

在文件顶部添加：

```typescript
import { useSubscriptionBypassCheck } from '@/lib/hooks/useSubscriptionBypassCheck'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
```

#### 2.2 在组件中添加Hook

在 `SellerSubscriptionPage` 函数内（约第121行）：

```typescript
// 检查是否需要跳过订阅（内部用户/直营卖家）
const { shouldBypass, isLoading: bypassLoading } = useSubscriptionBypassCheck()
```

#### 2.3 修改加载状态判断

找到现有的加载判断逻辑，添加 `bypassLoading`：

```typescript
// 在 return 语句之前添加检查（约第510行之前）
if (bypassLoading) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

// 内部用户/直营卖家不需要订阅
if (shouldBypass) {
  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <Card className="p-8 text-center">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-4 text-sm">
            {t('internalUserBadge')}
          </Badge>
          <h2 className="text-2xl font-bold mb-2">
            {t('internalUserSellerTitle')}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('internalUserSellerDescription')}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/seller/dashboard">
            <Button size="lg" className="w-full sm:w-auto">
              {t('goToSellerDashboard')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/subscription/manage">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              {t('manageSubscription')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
```

#### 2.4 可选：移除原有的直营卖家重定向

原有的直营卖家检查（第140-156行）可以保留作为冗余保护，或移除以简化代码：

```typescript
// 可选：移除这段代码，因为 useSubscriptionBypassCheck 已经覆盖了
useEffect(() => {
  if (!user) return
  // ... 原有代码
  if ((data as { seller_type?: string }).seller_type === 'direct') {
    router.replace('/seller/dashboard')
  }
}, [user, supabase, router])
```

---

### 步骤3：修改 Affiliate 订阅页面

**文件**：`src/app/[locale]/(main)/subscription/affiliate/page.tsx`

#### 3.1 添加导入

```typescript
import { useSubscriptionBypassCheck } from '@/lib/hooks/useSubscriptionBypassCheck'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
```

#### 3.2 在组件中添加Hook

在 `AffiliateSubscriptionPage` 函数内（约第96行）：

```typescript
// 检查是否需要跳过订阅（内部用户）
const { shouldBypass, isLoading: bypassLoading } = useSubscriptionBypassCheck()
```

#### 3.3 在return前添加拦截逻辑

```typescript
// 在 return 语句之前添加（约第336行之前）
if (bypassLoading) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

// 内部用户不需要订阅
if (shouldBypass) {
  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <Card className="p-8 text-center">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-4 text-sm">
            {t('internalUserBadge')}
          </Badge>
          <h2 className="text-2xl font-bold mb-2">
            {t('internalUserAffiliateTitle')}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('internalUserAffiliateDescription')}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/affiliate/dashboard">
            <Button size="lg" className="w-full sm:w-auto">
              {t('goToAffiliateDashboard')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/subscription/manage">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              {t('manageSubscription')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
```

---

### 步骤4：修改 Tip 订阅页面

**文件**：`src/app/[locale]/(main)/subscription/tip/page.tsx`

#### 4.1 添加导入

```typescript
import { useSubscriptionBypassCheck } from '@/lib/hooks/useSubscriptionBypassCheck'
```

#### 4.2 替换原有的内部用户检查

**删除**原有的 `isInternalUser` state 和 `checkUserType` effect（第97-98行和170-196行）。

**替换为**：

```typescript
// 在组件内（约第99行）
const { shouldBypass: shouldBypassSubscription, isLoading: bypassLoading } = useSubscriptionBypassCheck()
```

#### 4.3 更新加载状态和拦截逻辑

**修改**原有的加载判断（第374-380行）：

```typescript
// 更新为统一的加载判断
if (isCheckingUserType || bypassLoading) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

// 更新为统一的拦截判断
if (isInternalUser || shouldBypassSubscription) {
  // ... 保持原有UI不变
}
```

或者完全替换为：

```typescript
if (bypassLoading) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

if (shouldBypassSubscription) {
  // ... 原有内部用户UI
}
```

---

### 步骤5：添加翻译文案

**文件**：`messages/en.json`

在 `subscription` 对象下添加：

```json
{
  "subscription": {
    "internalUserBadge": "Internal User",
    "internalUserSellerTitle": "No Subscription Required",
    "internalUserSellerDescription": "As an internal user, you have seller privileges without purchasing a subscription.",
    "internalUserAffiliateTitle": "No Subscription Required",
    "internalUserAffiliateDescription": "As an internal user, you have affiliate privileges without purchasing a subscription.",
    "goToSellerDashboard": "Go to Seller Dashboard",
    "goToAffiliateDashboard": "Go to Affiliate Dashboard"
  }
}
```

**文件**：`messages/zh.json`

```json
{
  "subscription": {
    "internalUserBadge": "内部用户",
    "internalUserSellerTitle": "无需订阅",
    "internalUserSellerDescription": "作为内部用户，您无需购买订阅即可拥有卖家权限。",
    "internalUserAffiliateTitle": "无需订阅",
    "internalUserAffiliateDescription": "作为内部用户，您无需购买订阅即可拥有带货权限。",
    "goToSellerDashboard": "前往卖家后台",
    "goToAffiliateDashboard": "前往带货后台"
  }
}
```

---

## 备选方案：不创建Hook，直接内联

如果不希望创建新的Hook文件，可以直接在每个页面内联检查逻辑：

```typescript
// 在组件内添加 state
const [isInternalUser, setIsInternalUser] = useState(false)
const [isCheckingUserType, setIsCheckingUserType] = useState(true)

// 在 useEffect 中检查
useEffect(() => {
  const checkUserType = async () => {
    if (!user) {
      setIsCheckingUserType(false)
      return
    }
    
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_origin')
        .eq('id', user.id)
        .single()
      
      if (profile?.user_origin === 'internal') {
        setIsInternalUser(true)
      }
    } catch (error) {
      console.error('Error checking user type:', error)
    } finally {
      setIsCheckingUserType(false)
    }
  }
  
  checkUserType()
}, [user, supabase])

// 在 return 前拦截
if (isCheckingUserType) {
  return <LoadingSpinner />
}

if (isInternalUser) {
  return <InternalUserNotice />
}
```

**推荐**：使用Hook方案，代码复用性更好。

---

## 验证清单

实施完成后，请验证以下场景：

### 场景1：内部用户访问 Seller 订阅页面
- [ ] 访问 `/subscription/seller`
- [ ] 期望：显示"无需订阅"提示页面
- [ ] 点击"前往卖家后台"按钮能正常跳转

### 场景2：内部用户访问 Affiliate 订阅页面
- [ ] 访问 `/subscription/affiliate`
- [ ] 期望：显示"无需订阅"提示页面
- [ ] 点击"前往带货后台"按钮能正常跳转

### 场景3：内部用户访问 Tip 订阅页面
- [ ] 访问 `/subscription/tip`
- [ ] 期望：显示"无需订阅"提示页面（与原有逻辑一致）

### 场景4：直营卖家访问 Seller 订阅页面
- [ ] 使用直营卖家账号访问 `/subscription/seller`
- [ ] 期望：显示"无需订阅"提示页面（或被重定向）

### 场景5：普通用户访问订阅页面
- [ ] 使用普通用户账号访问三个订阅页面
- [ ] 期望：正常显示订阅内容和价格

### 场景6：未登录用户访问订阅页面
- [ ] 退出登录后访问三个订阅页面
- [ ] 期望：正常显示订阅内容（或根据业务需求重定向到登录页）

---

## 回滚方案

如果实施出现问题，回滚步骤：

1. **恢复代码**：
   - 删除 `useSubscriptionBypassCheck.ts` 文件（如果创建）
   - 恢复三个页面的原始代码

2. **数据库检查**：
   - 确认没有数据库schema变更（本方案不涉及）

3. **缓存清理**：
   - 清除 Next.js 构建缓存：`rm -rf .next`
   - 重新构建项目

---

## 相关文件参考

- `src/lib/hooks/useSubscriptionStatus.ts` - 订阅状态检查Hook
- `src/lib/auth/check-subscription.ts` - 服务端权限检查
- `src/app/api/admin/internal-users/[id]/set-direct-seller/route.ts` - 直营卖家API（证明直营卖家必定是内部用户）

---

## 注意事项

1. **权限一致性**：确保此方案与 `check-subscription.ts` 中的服务端权限检查保持一致
2. **性能考虑**：Hook使用缓存，不会频繁请求数据库
3. **用户体验**：拦截页面应提供清晰的操作指引（前往后台或管理页面）
4. **测试覆盖**：建议添加E2E测试覆盖内部用户的拦截场景
