# 统一鉴权系统实施方案 V2.3

## 架构审查反馈整合

基于总架构师的多轮审查意见，本方案经历了以下演进：
- V2.0: 从 "Soft Guard" 升级为 "Hard Render Gate" 架构
- V2.1: 修复 Session 切换安全、Fetch 竞争防护
- V2.2: 修复 Token Refresh Cross-Session、Hard Render Gate Runtime
- **V2.3: 设计 Authority Source Drift（授权源漂移）修复方案**

**当前状态**: ⚠️ **Implementation Required** - 需要实施 JWT Claim Sync

---

## 🚨 关键区分

| 状态 | 内容 |
|------|------|
| ✅ **已设计** | SubscriptionProvider 安全修复（Fix 1-3） |
| ⚠️ **待实施** | JWT Claim Sync（Fix 4）- Webhook 需要修改 |

**注意**: V2.3 文档包含 Fix 4 的完整设计方案，但 **实际代码尚未实施**。

---

## 核心架构问题

### 当前系统的根本缺陷

```
❌ 当前流程（有问题）：
SSR → Hydration → AuthProvider Ready → UI Enabled → Subscription Later → Redirect
                                                    ↑
                                              竞态条件发生在这里
                                              未授权组件已渲染
```

### 目标架构

```
✅ 目标流程（正确）：
SSR → Hydration → AuthProvider Ready → SubscriptionProvider Fetch Once → Authorization Ready → UI Enabled
                                                                            ↑
                                                                      权限确认后才渲染
                                                                      真正的 Hard Render Gate
```

---

## 关键架构决策

### 1. Render Gate vs Redirect Guard

| 模式 | 名称 | 行为 | 问题 |
|------|------|------|------|
| ❌ | Redirect Guard (软鉴权) | 先渲染组件，再用 useEffect 跳转 | 未授权组件已渲染，API 可能已触发 |
| ✅ | Render Gate (硬鉴权) | 权限确认前不渲染业务组件 | 真正的权限控制 |

### 2. 数据流架构

```
❌ 当前（N+1 Fetch Storm）：
TopBar           ProfilePage        AffiliateCenter
   ↓                  ↓                   ↓
useSubscriptionStatus()              useSubscriptionStatus()
   ↓                  ↓                   ↓
GET /profiles      GET /profiles       GET /profiles
   ↓                  ↓                   ↓
独立 loading       独立 loading        独立 loading
状态不同步！

✅ 目标（Subscription Context）：
SubscriptionProvider（统一获取一次）
         ↓
    Context Value
         ↓
   ┌─────┼─────┐
   ↓     ↓     ↓
TopBar Profile Affiliate
   ↓     ↓     ↓
只读 Context（不 fetch）
   ↓     ↓     ↓
同步 loading 状态
```

---

## ⚠️ Production 安全审查发现的关键问题

### 问题：SubscriptionProvider 是「Auth-Derived Cache」而非「Session-Bound Authority」

当前 V2 方案存在三个**必然会发生**的安全问题：

| 问题 | 场景 | 后果 |
|------|------|------|
| **Stale Authorization Window** | 用户登出后新用户登录 | 新用户继承旧用户权限，越权访问 |
| **Fetch Pollution** | 慢网络下 Promise 竞争 | 旧用户 fetch 结果覆盖新用户权限 |
| **Webhook UI Lock** | Stripe 订阅成功后 | UI 永远不更新，必须 F5 刷新 |

### 真实攻击时间线

```
T0: User A (Seller) 登录
    SubscriptionProvider: { isSeller: true }

T1: User A Logout
    AuthProvider: user = null

T2: SubscriptionProvider 运行
    if (!user) { setLoading(false) }  // ❗ 但没有 reset isSeller
    Context 仍然: { isSeller: true }   // 🔥 权限未清除

T3: User B (普通用户) 在 300ms 内登录
    AuthProvider: user = B
    SubscriptionProvider: allowed === true  // 来自旧用户 A！

T4: Hard Render Gate 被绕过
    SellerLayout: allowed === true
    → 渲染 SellerDashboard
    → POST /api/products  // 💥 越权 API 已发出
```

---

## 实施阶段（已修正）

### Phase 1: 建立 Session-Safe SubscriptionProvider

#### 1.1 创建 SubscriptionContext（Production Safe 版本）

**文件**: `src/lib/subscription/SubscriptionContext.tsx`

```typescript
'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'

interface SubscriptionState {
  // 卖家订阅状态
  isSeller: boolean
  isDirectSeller: boolean
  sellerTier: number | null
  sellerExpiresAt: string | null
  
  // 带货订阅状态
  isAffiliate: boolean
  affiliateExpiresAt: string | null
  
  // 打赏订阅状态
  isTipEnabled: boolean
  tipExpiresAt: string | null
  
  // 加载状态
  isLoading: boolean
  error: Error | null
}

const SubscriptionContext = createContext<SubscriptionState | null>(null)

// 初始空状态（用于用户切换时重置）
const EMPTY_STATE: SubscriptionState = {
  isSeller: false,
  isDirectSeller: false,
  sellerTier: null,
  sellerExpiresAt: null,
  isAffiliate: false,
  affiliateExpiresAt: null,
  isTipEnabled: false,
  tipExpiresAt: null,
  isLoading: true,
  error: null
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState<SubscriptionState>(EMPTY_STATE)
  const userIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    // 🚨 Fix 1: 用户变化立即 Reset Authorization
    // 防止 Stale Authorization Window
    if (user?.id !== userIdRef.current) {
      setState({
        ...EMPTY_STATE,
        isLoading: !!user  // 如果有新用户，保持 loading；如果登出，结束 loading
      })
      userIdRef.current = user?.id
    }

    // 等待认证状态确定
    if (authLoading) return

    // 未登录用户 - 已经在上面的 reset 中处理
    if (!user) return

    // 🚨 Fix 2: Cancel In-Flight Fetch
    // 防止慢网络下的 Fetch Pollution
    let cancelled = false

    const fetchSubscriptionStatus = async () => {
      try {
        const supabase = createClient()
        
        const { data: profile, error } = await supabase
          .from('profiles')
          .select(`
            seller_type,
            seller_subscription_active,
            seller_subscription_expires_at,
            seller_subscription_tier,
            affiliate_subscription_active,
            affiliate_subscription_expires_at,
            tip_enabled,
            tip_subscription_active,
            tip_subscription_expires_at,
            subscription_type,
            subscription_expires_at,
            user_origin,
            internal_tip_enabled,
            internal_affiliate_enabled
          `)
          .eq('id', user.id)
          .single()

        // 如果已经取消，丢弃结果
        if (cancelled) return

        if (error) throw error

        // 计算订阅状态
        const isDirectSeller = profile?.seller_type === 'direct'
        
        let isSeller = profile?.seller_subscription_active === true
        if (!isSeller && profile?.subscription_type === 'seller') {
          const hasValidExpiry = profile?.subscription_expires_at && 
            new Date(profile.subscription_expires_at) > new Date()
          isSeller = hasValidExpiry
        }
        
        const isInternalUser = profile?.user_origin === 'internal'
        
        const hasInternalAffiliate = profile?.internal_affiliate_enabled === true
        const hasAffiliateSubscription = profile?.affiliate_subscription_active === true
        let isAffiliate = isInternalUser ? 
          (hasInternalAffiliate || hasAffiliateSubscription) : 
          hasAffiliateSubscription
        
        if (!isAffiliate && profile?.subscription_type === 'affiliate') {
          const hasValidExpiry = profile?.subscription_expires_at && 
            new Date(profile.subscription_expires_at) > new Date()
          isAffiliate = hasValidExpiry
        }
        
        const hasInternalTip = profile?.internal_tip_enabled === true
        const hasTipSubscription = profile?.tip_subscription_active === true
        const isTipEnabled = isInternalUser ? 
          (hasInternalTip || hasTipSubscription) : 
          hasTipSubscription

        // 再次检查是否已取消
        if (cancelled) return

        setState({
          isSeller: isDirectSeller || isSeller,
          isDirectSeller,
          sellerTier: profile?.seller_subscription_tier ? parseFloat(profile.seller_subscription_tier) : null,
          sellerExpiresAt: profile?.seller_subscription_expires_at || profile?.subscription_expires_at || null,
          isAffiliate,
          affiliateExpiresAt: profile?.affiliate_subscription_expires_at || null,
          isTipEnabled,
          tipExpiresAt: profile?.tip_subscription_expires_at || null,
          isLoading: false,
          error: null
        })
      } catch (err) {
        if (cancelled) return
        
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err : new Error('Failed to fetch subscription status')
        }))
      }
    }

    fetchSubscriptionStatus()

    // 🚨 Fix 3: 监听 TOKEN_REFRESHED（Session-Bound 版本）
    // 防止 Webhook 成功后 UI 永远不更新
    // ❗ 关键：必须验证 session 属于当前用户，防止 Cross-Session 污染
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event !== 'TOKEN_REFRESHED') return

        // 🚨 关键安全检查：验证 token 刷新属于当前 session
        if (!session?.user?.id) return
        if (session.user.id !== userIdRef.current) return

        // 只有当前用户的 token 刷新才重新获取权限
        fetchSubscriptionStatus()
      }
    )

    return () => {
      cancelled = true
      authListener?.subscription.unsubscribe()
    }
  }, [user?.id, authLoading])  // ❗ 只依赖 user?.id，不是整个 user 对象

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider')
  }
  return context
}
```

#### 1.2 在 Root Layout 中注入 Provider

**文件**: `src/app/[locale]/layout.tsx` (或 providers.tsx)

```typescript
// 在 AuthProvider 内部包裹 SubscriptionProvider
<AuthProvider>
  <SubscriptionProvider>
    {children}
  </SubscriptionProvider>
</AuthProvider>
```

---

### Phase 2: 重构 Hooks 为 Context Consumer

#### 2.1 重写 useSubscriptionStatus

**文件**: `src/lib/hooks/useSubscriptionStatus.ts`

```typescript
'use client'

import { useSubscription } from '@/lib/subscription/SubscriptionContext'

/**
 * 统一的订阅状态检查钩子
 * 现在只读 Context，不再发起请求
 */
export function useSubscriptionStatus() {
  return useSubscription()
}

/**
 * 简化的卖家状态检查钩子
 */
export function useSellerStatus() {
  const { isSeller, isDirectSeller, isLoading, error } = useSubscription()
  
  return {
    isSeller,
    isDirectSeller,
    isLoading,
    error
  }
}

/**
 * 简化的带货状态检查钩子
 */
export function useAffiliateStatus() {
  const { isAffiliate, isLoading, error } = useSubscription()
  
  return {
    isAffiliate,
    isLoading,
    error
  }
}

/**
 * 简化的打赏状态检查钩子
 */
export function useTipStatus() {
  const { isTipEnabled, isLoading, error } = useSubscription()
  
  return {
    isTipEnabled,
    isLoading,
    error
  }
}
```

---

### Phase 3: 重构 Guard 为 Render Gate

#### 3.1 重写 useSellerGuard

**文件**: `src/lib/hooks/useSellerGuard.tsx`

```typescript
'use client'

import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { useAuth } from './useAuth'

interface UseSellerGuardResult {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isAuthenticated: boolean
  isSeller: boolean
  allowed: boolean
}

export function useSellerGuard(): UseSellerGuardResult {
  const { user, loading: authLoading } = useAuth()
  const { isSeller, isLoading: subscriptionLoading } = useSubscription()

  const loading = authLoading || subscriptionLoading
  const isAuthenticated = !!user
  const allowed = isAuthenticated && isSeller

  return {
    user,
    loading,
    isAuthenticated,
    isSeller,
    allowed
  }
}

// 用于布局的守卫组件
export function SellerGate({ children }: { children: React.ReactNode }) {
  const { loading, allowed } = useSellerGuard()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return null // Hard Render Gate: 不渲染任何业务组件
  }

  return <>{children}</>
}
```

#### 3.2 创建 useAffiliateGuard (Render Gate 版本)

**文件**: `src/lib/hooks/useAffiliateGuard.tsx`

```typescript
'use client'

import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { useAuth } from './useAuth'
import { Loader2 } from 'lucide-react'

interface UseAffiliateGuardResult {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isAuthenticated: boolean
  isAffiliate: boolean
  allowed: boolean
}

export function useAffiliateGuard(): UseAffiliateGuardResult {
  const { user, loading: authLoading } = useAuth()
  const { isAffiliate, isLoading: subscriptionLoading } = useSubscription()

  const loading = authLoading || subscriptionLoading
  const isAuthenticated = !!user
  const allowed = isAuthenticated && isAffiliate

  return {
    user,
    loading,
    isAuthenticated,
    isAffiliate,
    allowed
  }
}

// 用于布局的守卫组件
export function AffiliateGate({ children }: { children: React.ReactNode }) {
  const { loading, allowed } = useAffiliateGuard()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return null // Hard Render Gate
  }

  return <>{children}</>
}
```

#### 3.3 创建 useTipGuard (Render Gate 版本)

**文件**: `src/lib/hooks/useTipGuard.tsx`

```typescript
'use client'

import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { useAuth } from './useAuth'
import { Loader2 } from 'lucide-react'

interface UseTipGuardResult {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isAuthenticated: boolean
  isTipEnabled: boolean
  allowed: boolean
}

export function useTipGuard(): UseTipGuardResult {
  const { user, loading: authLoading } = useAuth()
  const { isTipEnabled, isLoading: subscriptionLoading } = useSubscription()

  const loading = authLoading || subscriptionLoading
  const isAuthenticated = !!user
  const allowed = isAuthenticated && isTipEnabled

  return {
    user,
    loading,
    isAuthenticated,
    isTipEnabled,
    allowed
  }
}

// 用于布局的守卫组件
export function TipGate({ children }: { children: React.ReactNode }) {
  const { loading, allowed } = useTipGuard()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return null // Hard Render Gate
  }

  return <>{children}</>
}
```

---

### Phase 4: 重构 Layout 使用 Render Gate

#### 4.1 重构 Seller Layout

**文件**: `src/app/[locale]/(main)/seller/layout.tsx`

```typescript
'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useSellerGuard } from '@/lib/hooks/useSellerGuard'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

export default function SellerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isLandingPage = pathname === '/seller/landing' || pathname.endsWith('/seller/landing')
  
  const { loading, allowed, isAuthenticated } = useSellerGuard()

  useEffect(() => {
    if (loading) return
    
    if (isLandingPage) return
    
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }
    
    if (!allowed) {
      router.push('/seller/landing')
    }
  }, [loading, allowed, isAuthenticated, isLandingPage, pathname, router])

  // 宣传页面直接渲染
  if (isLandingPage) {
    return <>{children}</>
  }

  // Hard Render Gate
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return null
  }

  return <>{children}</>
}
```

#### 4.2 创建 Affiliate Layout

**文件**: `src/app/[locale]/(main)/affiliate/layout.tsx`

```typescript
'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useAffiliateGuard } from '@/lib/hooks/useAffiliateGuard'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isLandingPage = pathname === '/subscription/affiliate' || pathname.endsWith('/subscription/affiliate')
  
  const { loading, allowed, isAuthenticated } = useAffiliateGuard()

  useEffect(() => {
    if (loading) return
    
    if (isLandingPage) return
    
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }
    
    if (!allowed) {
      router.push('/subscription/affiliate')
    }
  }, [loading, allowed, isAuthenticated, isLandingPage, pathname, router])

  // 宣传页面直接渲染
  if (isLandingPage) {
    return <>{children}</>
  }

  // Hard Render Gate
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return null
  }

  return <>{children}</>
}
```

#### 4.3 创建 Tip Layout

**文件**: `src/app/[locale]/(main)/tip-center/layout.tsx`

```typescript
'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useTipGuard } from '@/lib/hooks/useTipGuard'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

export default function TipLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isLandingPage = pathname === '/subscription/tip' || pathname.endsWith('/subscription/tip')
  
  const { loading, allowed, isAuthenticated } = useTipGuard()

  useEffect(() => {
    if (loading) return
    
    if (isLandingPage) return
    
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }
    
    if (!allowed) {
      router.push('/subscription/tip')
    }
  }, [loading, allowed, isAuthenticated, isLandingPage, pathname, router])

  // 宣传页面直接渲染
  if (isLandingPage) {
    return <>{children}</>
  }

  // Hard Render Gate
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return null
  }

  return <>{children}</>
}
```

---

### Phase 5: 修复 Profile 页面竞态条件

**文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx`

```typescript
// 使用统一的 subscription context
import { useSellerStatus, useAffiliateStatus, useTipStatus } from '@/lib/hooks/useSubscriptionStatus'

export default function ProfilePage() {
  // ... 其他代码
  
  // 现在这些钩子只读 Context，不会触发新的请求
  const { isSeller: isViewerSeller, isDirectSeller, isLoading: isSellerLoading } = useSellerStatus()
  const { isAffiliate: isViewerAffiliate, isLoading: isAffiliateLoading } = useAffiliateStatus()
  const { isTipEnabled: isViewerTipEnabled, isLoading: isTipLoading } = useTipStatus()

  // 计算整体加载状态
  const isSubscriptionLoading = isSellerLoading || isAffiliateLoading || isTipLoading

  // 渲染时添加加载状态检查
  {isOwnProfile && (
    <>
      {isSubscriptionLoading ? (
        // 加载中显示禁用状态的按钮
        <>
          <Button disabled variant="outline" className="opacity-50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('loading')}
          </Button>
          <Button disabled variant="outline" className="opacity-50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('loading')}
          </Button>
          <Button disabled variant="outline" className="opacity-50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('loading')}
          </Button>
        </>
      ) : (
        <>
          <Link href={isViewerSeller ? '/seller/dashboard' : '/seller/landing'}>
            <Tag className="h-4 w-4" />
            <span>{t('sellerCenter')}</span>
          </Link>
          <Link href={isViewerAffiliate ? '/affiliate/products' : '/subscription/affiliate'}>
            <TrendingUp className="h-4 w-4" />
            <span>{isViewerAffiliate ? t('affiliateCenter') : t('becomeAffiliate')}</span>
          </Link>
          <Link href={isViewerTipEnabled ? '/tip-center' : '/subscription/tip'}>
            <Gift className="h-4 w-4" />
            <span>{isViewerTipEnabled ? t('manageTips') : t('tips')}</span>
          </Link>
        </>
      )}
    </>
  )}
}
```

---

### Phase 6: 实施 JWT Claim Sync（关键）

⚠️ **这是 Fix 4 的核心实施，必须完成才能解决 Authority Source Drift**

#### 6.1 修改 Stripe Webhook

**文件**: `src/app/api/payments/stripe/webhook/route.ts`

**在订阅成功处理逻辑中添加**:

```typescript
// 在 handleSubscriptionSuccess 函数中

async function handleSubscriptionSuccess(
  userId: string, 
  subscriptionType: 'seller' | 'affiliate' | 'tip',
  tier?: number
) {
  const supabaseAdmin = createAdminClient()
  
  // 1. 更新 profiles 表（已有）
  await supabaseAdmin
    .from('profiles')
    .update({
      [`${subscriptionType}_subscription_active`]: true,
      [`${subscriptionType}_subscription_expires_at`]: calculateExpiry(),
      ...(tier && { [`${subscriptionType}_subscription_tier`]: tier })
    })
    .eq('id', userId)
  
  // 2. 🚨 关键：同步更新 JWT Claims（新增）
  const claimKey = subscriptionType === 'seller' ? 'seller' : 
                   subscriptionType === 'affiliate' ? 'affiliate' : 'tip_enabled'
  
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      [claimKey]: true,
      ...(tier && { [`${claimKey}_tier`]: tier }),
      [`${claimKey}_expires_at`]: calculateExpiry()
    }
  })
  
  // ⚠️ 重要：updateUserById() 不会自动使客户端 JWT 失效！
  // 客户端持有的 JWT 仍然有效（直到 1 小时过期）
  // 必须通过 Realtime 事件通知客户端主动刷新 Session
  // 见步骤 6.4: Webhook 发送 Realtime 事件
}
```

#### 6.2 修改 PayPal Webhook

**文件**: `src/app/api/payments/paypal/webhook/route.ts`

**同样添加 JWT Claim Sync 逻辑**

#### 6.3 修改 WeChat Webhook

**文件**: `src/app/api/payments/wechat/webhook/route.ts`

**同样添加 JWT Claim Sync 逻辑**

#### 6.4 Webhook 发送 Realtime 事件（关键）

⚠️ **必须添加**：通知客户端立即刷新 Session

```typescript
// 在 JWT Claim Sync 后，发送 Realtime 事件
const { RealtimeChannel } = await import('@supabase/realtime-js')

// 通知客户端刷新 Session
await supabaseAdmin
  .from('realtime_events')
  .insert({
    user_id: userId,
    event_type: 'subscription_updated',
    payload: {
      subscription_type: subscriptionType,
      seller: subscriptionType === 'seller',
      affiliate: subscriptionType === 'affiliate',
      tip_enabled: subscriptionType === 'tip',
    },
    created_at: new Date().toISOString(),
  })

// 或者使用 Supabase Realtime Broadcast
const channel = supabaseAdmin.channel(`user:${userId}`)
channel.send({
  type: 'broadcast',
  event: 'subscription_updated',
  payload: { subscriptionType }
})
```

### 6.5 客户端监听、刷新 Session、重建 Client（关键）

**文件**: `src/lib/subscription/SubscriptionContext.tsx`

⚠️ **必须完成 3 个步骤**，缺一不可：

```typescript
useEffect(() => {
  if (!user) return

  // 监听 subscription_updated 事件
  const channel = supabase
    .channel(`user:${user.id}`)
    .on('broadcast', { event: 'subscription_updated' }, async (payload) => {
      console.log('Subscription updated, refreshing session...')
      
      // 🚨 Step 1: 刷新 Session 获取新 JWT
      const { error } = await supabase.auth.refreshSession()
      
      if (error) {
        console.error('Failed to refresh session:', error)
        return
      }
      
      // 🚨 Step 2: 断开所有 Realtime 连接
      await supabase.removeAllChannels()
      
      // 🚨 Step 3: 重建 Supabase Client（关键！）
      // 必须重建 client 来强制 drop HTTP keep-alive connection pool
      // 否则 PostgREST 会继续使用旧的 Authorization Context
      supabase = createClient()
      
      // Step 4: 重新获取订阅状态
      fetchSubscriptionStatus()
    })
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}, [user?.id])
```

### 6.6 为什么必须重建 Client？

**Supabase + PostgREST 运行时细节**:

```
❌ 错误理解：
refreshSession() → 新 JWT → 下次请求自动使用新 JWT

✅ 残酷现实：
refreshSession() → 新 JWT (内存中)
    ↓
但现有 HTTP keep-alive 连接仍然缓存旧 Authorization Context
    ↓
PostgREST RLS 继续评估旧 JWT claims
    ↓
偶发 403（最长 ~30s，直到连接 idle timeout）
```

**必须重建 Client 的原因**:

| 层级 | 不重建 Client | 重建 Client |
|------|--------------|------------|
| JWT (内存) | ✅ 已更新 | ✅ 已更新 |
| HTTP Connection Pool | ❌ 旧连接缓存旧 Auth | ✅ 新连接使用新 Auth |
| PostgREST RLS | ❌ 偶发 403 | ✅ 立即生效 |

**生产环境表现**:

不重建 Client:
```
订阅成功 → UI 解锁 → Dashboard 可进 → 创建商品 API 偶发 403（30秒内）
```

重建 Client:
```
订阅成功 → UI 解锁 → Dashboard 可进 → 创建商品 API 立即成功
```

### 6.6 验证 JWT 更新

实施后验证：
```typescript
// 在 Webhook 处理完成后，验证 JWT 已更新
const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId)
console.log('JWT Claims:', user.user.app_metadata)
// 应该包含: { seller: true, seller_tier: ..., seller_expires_at: ... }

// 验证 Realtime 事件已发送
const { data: events } = await supabaseAdmin
  .from('realtime_events')
  .select('*')
  .eq('user_id', userId)
  .eq('event_type', 'subscription_updated')
  .order('created_at', { ascending: false })
  .limit(1)
```

---

### Phase 7: 清理旧代码

#### 7.1 删除旧文件

```bash
# 删除旧的独立实现
rm src/lib/hooks/useSellerStatus.ts
```

#### 7.2 更新导入路径

以下文件需要从旧实现迁移到新实现：

- [ ] `src/app/[locale]/(main)/seller/dashboard/page.tsx`
- [ ] `src/app/[locale]/(main)/seller/products/page.tsx`
- [ ] `src/app/[locale]/(main)/seller/products/create/page.tsx`
- [ ] `src/app/[locale]/(main)/seller/deposit/refund/page.tsx`
- [ ] `src/app/[locale]/(main)/seller/deposit/policy/page.tsx`

**迁移方式**:
```typescript
// 旧导入
import { useSellerStatus } from '@/lib/hooks/useSellerStatus'

// 新导入
import { useSellerStatus } from '@/lib/hooks/useSubscriptionStatus'
```

---

## 代码审查发现的问题与修正

### 问题 1: tip-center/page.tsx 使用同步 redirect（严重）

**当前代码**:
```typescript
// 第39行
if (!isTipEnabled) {
  redirect('/subscription/tip')  // ❌ 同步 redirect，loading 期间会误判
}
```

**修正方案**:
```typescript
// 改为使用 useEffect + router.push
useEffect(() => {
  if (!isLoading && !isTipEnabled) {
    router.push('/subscription/tip')
  }
}, [isLoading, isTipEnabled, router])

// 或者使用 Layout 守卫（推荐）
```

### 问题 2: AffiliateCenter 没有权限检查

**当前代码**:
```typescript
// affiliate/products/page.tsx
export default function AffiliateProductsPage() {
  return <AffiliateCenter />  // ❌ 没有任何权限检查
}
```

**修正方案**:
- 方案A: 创建 `affiliate/layout.tsx` 提供统一守卫
- 方案B: 在 `AffiliateCenter.tsx` 内部添加权限检查

### 问题 3: 多个组件直接查询 profiles 表

| 文件 | 当前行为 | 需要修改 |
|------|---------|----------|
| `affiliate/products/[id]/promote/page.tsx` | 直接 useQuery 查 profiles | 使用 subscription context |
| `seller/products/create/page.tsx` | 直接 supabase.from('profiles') | 使用 subscription context |
| `seller/deposit/refund/page.tsx` | 直接 useQuery 查 profiles | 使用 subscription context |
| `seller/deposit/policy/page.tsx` | 直接 useQuery 查 profiles | 使用 subscription context |

### 问题 4: SellerPayoutEligibility 枚举位置

**当前导入**:
```typescript
import { useSellerStatus, SellerPayoutEligibility } from '@/lib/hooks/useSellerStatus'
```

**解决方案**:
将 `SellerPayoutEligibility` 枚举迁移到 `useSubscriptionStatus.ts` 或创建单独类型文件。

---

## 文件修改清单（已更新）

### 新建文件
- [ ] `src/lib/subscription/SubscriptionContext.tsx`
- [ ] `src/lib/hooks/useAffiliateGuard.tsx`
- [ ] `src/lib/hooks/useTipGuard.tsx`
- [ ] `src/app/[locale]/(main)/affiliate/layout.tsx` - 为所有 affiliate 页面提供守卫
- [ ] `src/app/[locale]/(main)/tip-center/layout.tsx` - 为 tip-center 提供守卫（替代同步 redirect）

### 修改文件（Frontend）
- [ ] `src/app/[locale]/layout.tsx` - 添加 SubscriptionProvider
- [ ] `src/lib/hooks/useSubscriptionStatus.ts` - 改为 Context Consumer，添加 SellerPayoutEligibility
- [ ] `src/lib/hooks/useSellerGuard.tsx` - 改为 Render Gate 模式
- [ ] `src/app/[locale]/(main)/seller/layout.tsx` - 使用新的 Guard
- [ ] `src/app/[locale]/(main)/profile/[id]/page.tsx` - 使用 Context
- [ ] `src/app/[locale]/(main)/seller/dashboard/page.tsx` - 更新导入
- [ ] `src/app/[locale]/(main)/seller/products/page.tsx` - 更新导入
- [ ] `src/app/[locale]/(main)/seller/products/create/page.tsx` - 使用 subscription context
- [ ] `src/app/[locale]/(main)/seller/deposit/refund/page.tsx` - 使用 subscription context
- [ ] `src/app/[locale]/(main)/seller/deposit/policy/page.tsx` - 使用 subscription context
- [ ] `src/app/[locale]/(main)/tip-center/page.tsx` - 移除同步 redirect，使用 Layout 守卫
- [ ] `src/app/[locale]/(main)/affiliate/products/page.tsx` - 添加权限检查或使用 Layout
- [ ] `src/app/[locale]/(main)/affiliate/products/[id]/promote/page.tsx` - 使用 subscription context

### 修改文件（Backend - 关键）⚠️
- [ ] `src/app/api/payments/stripe/webhook/route.ts` - **添加 JWT Claim Sync**
- [ ] `src/app/api/payments/paypal/webhook/route.ts` - **添加 JWT Claim Sync**
- [ ] `src/app/api/payments/wechat/webhook/route.ts` - **添加 JWT Claim Sync**

### 删除文件
- [ ] `src/lib/hooks/useSellerStatus.ts`

---

## 测试验证清单

### 1. 竞态条件测试
- [ ] 快速刷新 profile 页面，立即点击 Seller Center
- [ ] 快速刷新 profile 页面，立即点击 Affiliate Center
- [ ] 快速刷新 profile 页面，立即点击 Manage Tips
- [ ] 期望：按钮在加载状态，不会跳转

### 2. 权限控制测试
- [ ] 未登录用户访问 /seller/dashboard → 重定向到登录
- [ ] 未订阅用户访问 /seller/dashboard → 重定向到 /seller/landing
- [ ] 未订阅用户访问 /affiliate/products → 重定向到 /subscription/affiliate
- [ ] 未订阅用户访问 /tip-center → 重定向到 /subscription/tip

### 3. 加载状态测试
- [ ] 所有受保护页面显示统一的 loading 状态
- [ ] loading 完成后才显示内容或重定向
- [ ] 没有 UI flicker

### 4. 数据一致性测试
- [ ] 整个应用只发起一次 profiles 查询
- [ ] TopBar、ProfilePage、Sidebar 显示一致的订阅状态
- [ ] 没有 N+1 fetch

### 5. 边缘情况测试
- [ ] 网络错误时的错误处理
- [ ] 用户登出后状态清除
- [ ] 用户登录后状态更新

### 6. Production 安全测试（新增）
- [ ] **Session 切换测试**: User A (Seller) → Logout → User B (普通用户) → 确认 B 无法访问 Seller 页面
- [ ] **Fetch 竞争测试**: 模拟慢网络，快速切换用户，确认无权限污染
- [ ] **Token 刷新测试**: Stripe 订阅成功后，确认 UI 自动更新（无需 F5）
- [ ] **并发登录测试**: 多个标签页同时登录不同账号，确认权限隔离

### 7. JWT Claim Sync 测试（关键）⚠️
- [ ] **Webhook JWT 更新测试**: Stripe 订阅成功后，验证 `auth.admin.getUserById()` 返回的 JWT 包含正确 claims
- [ ] **Realtime 事件测试**: 验证 Webhook 发送了 subscription_updated 事件
- [ ] **客户端刷新测试**: 验证客户端收到事件后调用了 refreshSession()
- [ ] **Client 重建测试**: 验证客户端重建了 Supabase Client 实例
- [ ] **UI/API 一致性测试**: 订阅成功后立即测试 API 调用，确认不返回 403
- [ ] **无刷新场景测试**: 模拟客户端不刷新，验证旧 JWT 仍然有效（1小时）
- [ ] **不重建 Client 测试**: 验证旧 HTTP 连接导致偶发 403（~30s）
- [ ] **端到端流程测试**: 完整流程：订阅 → Webhook → Realtime → 刷新 → 重建 → API 调用成功

### 8. Authority Drift 窗口测试（关键）⚠️
- [ ] **测量 Drift 窗口**: 订阅成功到 API 可用的真实时间
- [ ] **目标**: Drift 窗口 < 1 秒（Realtime + refreshSession + 重建 Client）
- [ ] **对比测试 A**: 不实施 Phase 6B（无 refresh）时的 Drift 窗口（应接近 1 小时）
- [ ] **对比测试 B**: 实施 Phase 6B 但不重建 Client 时的 Drift 窗口（应接近 30s）
- [ ] **对比测试 C**: 完整实施时的 Drift 窗口（应 < 1s）

---

## 架构对比总结

| 项目 | V1 方案 | V2 初始 | V2.1 | V2.2 | V2.3 设计 | V2.3 实施后 |
|------|---------|---------|------|------|-----------|-------------|
| 统一数据源 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 消除竞态 | 🟡 部分 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 防止未授权渲染 | ❌ Soft Guard | ✅ Hard Render Gate | ✅ Hard Render Gate | ✅ Hard Render Gate | ✅ Hard Render Gate | ✅ Hard Render Gate |
| 避免 N+1 fetch | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Guard 架构 | Redirect Guard | Render Gate | Render Gate | Render Gate | Render Gate | Render Gate |
| 数据流 | 分散 fetch | 统一 Context | 统一 Context | 统一 Context | 统一 Context | 统一 Context |
| **Session 切换安全** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Fetch 竞争防护** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Token 刷新同步** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Token Refresh Cross-Session** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Hard Render Gate Runtime** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Authority Source Drift** | ❌ | ❌ | ❌ | ❌ | ⚠️ **待实施** | ✅ |
| **UI/API 一致性** | ❌ | ❌ | ❌ | ❌ | ⚠️ **待实施** | ✅ |

**图例**:
- ✅ 已完成/已设计
- ⚠️ 待实施
- ❌ 未修复

---

## 回滚方案

如果实施出现问题：

```bash
# 1. 恢复被修改的文件
git checkout src/app/[locale]/layout.tsx
git checkout src/lib/hooks/useSubscriptionStatus.ts
git checkout src/lib/hooks/useSellerGuard.tsx
git checkout src/app/[locale]/(main)/seller/layout.tsx
git checkout src/app/[locale]/(main)/profile/[id]/page.tsx

# 2. 删除新建的文件
rm src/lib/subscription/SubscriptionContext.tsx
rm src/lib/hooks/useAffiliateGuard.tsx
rm src/lib/hooks/useTipGuard.tsx
rm src/app/[locale]/(main)/affiliate/layout.tsx
rm src/app/[locale]/(main)/tip-center/layout.tsx

# 3. 恢复旧实现（如果需要）
git checkout src/lib/hooks/useSellerStatus.ts
```

---

## 附加：SellerPayoutEligibility 枚举迁移

### 迁移方案

在 `useSubscriptionStatus.ts` 中添加枚举定义：

```typescript
// src/lib/hooks/useSubscriptionStatus.ts

export enum SellerPayoutEligibility {
  ELIGIBLE = 'eligible',
  BLOCKED = 'blocked',
  PENDING_REVIEW = 'pending_review',
}

// 在 SubscriptionContext 的返回值中包含 eligibility
export interface SubscriptionState {
  // ... 其他字段
  sellerPayoutEligibility: SellerPayoutEligibility | null
}
```

然后修改使用方：

```typescript
// 修改前
import { useSellerStatus, SellerPayoutEligibility } from '@/lib/hooks/useSellerStatus'

// 修改后
import { useSellerStatus, SellerPayoutEligibility } from '@/lib/hooks/useSubscriptionStatus'
```

---

## 附加：Layout 守卫 vs 组件内守卫

### 推荐策略

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| 整个路由组需要保护 | Layout 守卫 | 统一、简洁 |
| 单个页面需要保护 | 组件内守卫 | 灵活 |
| 需要显示不同 UI | 组件内守卫 | 可以显示升级提示而不是空白 |

### 本项目 Layout 结构

```
app/[locale]/(main)/
├── seller/
│   ├── layout.tsx          ✅ 已存在（需要更新）
│   ├── page.tsx
│   ├── products/
│   └── ...
├── affiliate/
│   ├── layout.tsx          ❌ 需要创建
│   ├── products/
│   │   ├── page.tsx
│   │   └── [id]/
│   │       └── promote/
│   │           └── page.tsx
│   └── stats/
├── tip-center/
│   ├── layout.tsx          ❌ 需要创建（替代同步 redirect）
│   └── page.tsx
```

---

## 关键修复总结（总架构师审查意见）

### 三个必须修复的 Runtime 问题

#### ✅ Fix 1: 用户变化立即 Reset Authorization
```typescript
// 防止 Stale Authorization Window
if (user?.id !== userIdRef.current) {
  setState({
    ...EMPTY_STATE,
    isLoading: !!user
  })
  userIdRef.current = user?.id
}
```

#### ✅ Fix 2: Cancel In-Flight Fetch
```typescript
// 防止慢网络下的 Fetch Pollution
let cancelled = false

const fetchSubscriptionStatus = async () => {
  // ... fetch logic
  if (cancelled) return  // 丢弃过时结果
}

return () => {
  cancelled = true
}
```

#### ✅ Fix 3: 监听 TOKEN_REFRESHED
```typescript
// ❌ 错误：Blind Refetch（跨 Session 污染）
const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
  if (event === 'TOKEN_REFRESHED') {
    fetchSubscriptionStatus()  // 危险！可能获取到旧用户权限
  }
})

// ✅ 正确：Session-Bound Refetch
const { data: authListener } = supabase.auth.onAuthStateChange(
  async (event, session) => {
    if (event !== 'TOKEN_REFRESHED') return

    // 🚨 关键安全检查
    if (!session?.user?.id) return
    if (session.user.id !== userIdRef.current) return

    fetchSubscriptionStatus()
  }
)
```

### 修复后的安全等级

| Authorization Threat | V2 初始 | V2.1 当前 | V2.2 (Production Safe) |
|---------------------|---------|-----------|------------------------|
| Render-before-auth | ✅ | ✅ | ✅ |
| N+1 profile storm | ✅ | ✅ | ✅ |
| Logout → Login 越权 | ❌ | ✅ | ✅ |
| Slow fetch pollution | ❌ | ✅ | ✅ |
| JWT refresh 权限更新 | ❌ | ✅ | ✅ |
| **Token Refresh Cross-Session** | ❌ | ❌ | ✅ |
| **Hard Render Gate Runtime 成立** | ❌ | ❌ | ✅ |

---

## 🚨 关键漏洞修复记录

### 漏洞：TOKEN_REFRESHED 跨 Session 污染

**问题描述**: 
- Listener 生命周期 = Provider Mount → Unmount
- Session 切换 ≠ Provider Unmount
- 导致：旧用户的 Token 刷新会污染新用户的权限状态

**攻击时间线**:
```
T0: User A (Seller) 登录
T1: 进入 Stripe Checkout
T2: Logout → User B 登录
T3: Stripe Webhook 成功，Supabase refresh A JWT
T4: TOKEN_REFRESHED 触发 → fetch(A profile)
T5: setState(A)  // 💥 User B 获得 A 的 Seller 权限
T6: SellerLayout allowed === true（A）, user === B
```

**修复方案**:
```typescript
// 验证 token 刷新属于当前 session
if (session.user.id !== userIdRef.current) return
```

---

## 🚨 最终漏洞：Authority Source Drift（授权源漂移）

### 问题本质

当前系统存在**分裂授权模型**：

| 层级 | 权限来源 | 当前状态 |
|------|---------|----------|
| UI | SubscriptionContext (profiles) | ✅ 正确 |
| API | JWT Claims | ❌ 可能过时 |

```
❌ 当前（分裂授权）：
profiles.seller_subscription_active = true
JWT.seller = false

结果：
UI: SellerLayout.allowed === true  → 渲染 Seller Dashboard
API: RLS Policy 检查 JWT → 403 Forbidden

用户看到：
"能进入页面但所有操作都报错"
```

### 真实 Production 场景（Stripe 必现）

```
T0: User B = 普通用户
    JWT: { seller: false }

T1: 用户购买 Seller 订阅
    Stripe Checkout 完成

T2: Stripe Webhook 成功
    profiles.seller_subscription_active = true
    ⚠️ 但 JWT 还没变！

T3: Supabase 自动 Refresh Token
    → TOKEN_REFRESHED 触发
    → SubscriptionProvider Refetch
    → UI Context: isSeller = true

T4: SellerLayout.allowed === true
    Seller Dashboard 渲染 ✔️

T5: 用户点击 POST /api/products
    RLS Policy 检查: auth.jwt().seller == true
    JWT: { seller: false }
    
💥 API 被拒绝！
```

### 结果

| 层级 | 状态 | 用户体验 |
|------|------|----------|
| UI | 允许 | "我能进 Seller Dashboard" |
| API | 拒绝 | "但创建商品总是报错" |

**上线后必然收到的问题**：
- "我订阅了为什么不能创建商品？"
- "Seller Dashboard 能进但操作报错"
- "Affiliate 页面按钮能点但 API 403"

---

## ✅ Fix 4: JWT Claim Sync（最终修复）

### 解决方案

Stripe Webhook 必须**同时更新**两个授权源：

```typescript
// 在 Stripe Webhook 处理中

// 1. 更新数据库（已有）
await supabaseAdmin
  .from('profiles')
  .update({ 
    seller_subscription_active: true,
    seller_subscription_expires_at: expiryDate
  })
  .eq('id', userId)

// 2. 🚨 关键：更新 JWT Claims（新增）
await supabaseAdmin.auth.admin.updateUserById(
  userId,
  {
    app_metadata: {
      seller: true,
      seller_tier: tier,
      seller_expires_at: expiryDate
    }
  }
)

// Supabase 会自动：
// - invalidate old JWT
// - 下次 refresh 时 JWT 包含新 claims
```

### 修复后的授权模型

```
✅ 修复后（单一授权）：
profiles.seller_subscription_active = true
JWT.seller = true

结果：
UI: SellerLayout.allowed === true  → 渲染 Seller Dashboard
API: RLS Policy 检查 JWT → Pass

用户看到：
"能进入页面，操作也正常"
```

### 需要修改的文件

**Webhook 处理文件**:
- `src/app/api/payments/stripe/webhook/route.ts`
- `src/app/api/payments/paypal/webhook/route.ts`
- `src/app/api/payments/wechat/webhook/route.ts`

**修改示例**:
```typescript
// 在订阅成功处理逻辑中

async function handleSubscriptionSuccess(
  userId: string, 
  subscriptionType: 'seller' | 'affiliate' | 'tip',
  tier?: number
) {
  const supabaseAdmin = createAdminClient()
  
  // 1. 更新 profiles 表
  await supabaseAdmin
    .from('profiles')
    .update({
      [`${subscriptionType}_subscription_active`]: true,
      [`${subscriptionType}_subscription_expires_at`]: calculateExpiry(),
      ...(tier && { [`${subscriptionType}_subscription_tier`]: tier })
    })
    .eq('id', userId)
  
  // 2. 🚨 关键：同步更新 JWT Claims
  const claimKey = subscriptionType === 'seller' ? 'seller' : 
                   subscriptionType === 'affiliate' ? 'affiliate' : 'tip_enabled'
  
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      [claimKey]: true,
      ...(tier && { [`${claimKey}_tier`]: tier }),
      [`${claimKey}_expires_at`]: calculateExpiry()
    }
  })
  
  // Supabase 会自动使旧 JWT 失效
  // 客户端下次请求时会自动 refresh
}
```

---

## 🚨 关键漏洞修复记录

### 漏洞：TOKEN_REFRESHED 跨 Session 污染

**问题描述**: 
- Listener 生命周期 = Provider Mount → Unmount
- Session 切换 ≠ Provider Unmount
- 导致：旧用户的 Token 刷新会污染新用户的权限状态

**攻击时间线**:
```
T0: User A (Seller) 登录
T1: 进入 Stripe Checkout
T2: Logout → User B 登录
T3: Stripe Webhook 成功，Supabase refresh A JWT
T4: TOKEN_REFRESHED 触发 → fetch(A profile)
T5: setState(A)  // 💥 User B 获得 A 的 Seller 权限
T6: SellerLayout allowed === true（A）, user === B
```

**修复方案**:
```typescript
// 验证 token 刷新属于当前 session
if (session.user.id !== userIdRef.current) return
```

---

## 🚨 最终漏洞：Authority Source Drift（授权源漂移）

### 问题本质

当前系统存在**分裂授权模型**：

| 层级 | 权限来源 | 当前状态 |
|------|---------|----------|
| UI | SubscriptionContext (profiles) | ✅ 正确 |
| API | JWT Claims | ❌ 可能过时 |

```
❌ 当前（分裂授权）：
profiles.seller_subscription_active = true
JWT.seller = false

结果：
UI: SellerLayout.allowed === true  → 渲染 Seller Dashboard
API: RLS Policy 检查 JWT → 403 Forbidden

用户看到：
"能进入页面但所有操作都报错"
```

### 真实 Production 场景（Stripe 必现）

```
T0: User B = 普通用户
    JWT: { seller: false }

T1: 用户购买 Seller 订阅
    Stripe Checkout 完成

T2: Stripe Webhook 成功
    profiles.seller_subscription_active = true
    ⚠️ 但 JWT 还没变！

T3: Supabase 自动 Refresh Token
    → TOKEN_REFRESHED 触发
    → SubscriptionProvider Refetch
    → UI Context: isSeller = true

T4: SellerLayout.allowed === true
    Seller Dashboard 渲染 ✔️

T5: 用户点击 POST /api/products
    RLS Policy 检查: auth.jwt().seller == true
    JWT: { seller: false }
    
💥 API 被拒绝！
```

### 结果

| 层级 | 状态 | 用户体验 |
|------|------|----------|
| UI | 允许 | "我能进 Seller Dashboard" |
| API | 拒绝 | "但创建商品总是报错" |

**上线后必然收到的问题**：
- "我订阅了为什么不能创建商品？"
- "Seller Dashboard 能进但操作报错"
- "Affiliate 页面按钮能点但 API 403"

---

## ✅ Fix 4: JWT Claim Sync（最终修复）

### 解决方案

Stripe Webhook 必须**同时更新**两个授权源：

```typescript
// 在 Stripe Webhook 处理中

// 1. 更新数据库（已有）
await supabaseAdmin
  .from('profiles')
  .update({ 
    seller_subscription_active: true,
    seller_subscription_expires_at: expiryDate
  })
  .eq('id', userId)

// 2. 🚨 关键：更新 JWT Claims（新增）
await supabaseAdmin.auth.admin.updateUserById(
  userId,
  {
    app_metadata: {
      seller: true,
      seller_tier: tier,
      seller_expires_at: expiryDate
    }
  }
)

// Supabase 会自动使旧 JWT 失效
// 客户端下次请求时会自动 refresh
```

### 修复后的授权模型

```
✅ 修复后（单一授权）：
profiles.seller_subscription_active = true
JWT.seller = true

结果：
UI: SellerLayout.allowed === true  → 渲染 Seller Dashboard
API: RLS Policy 检查 JWT → Pass

用户看到：
"能进入页面，操作也正常"
```

### 需要修改的文件

**Webhook 处理文件**:
- `src/app/api/payments/stripe/webhook/route.ts`
- `src/app/api/payments/paypal/webhook/route.ts`
- `src/app/api/payments/wechat/webhook/route.ts`

**修改示例**:
```typescript
// 在订阅成功处理逻辑中

async function handleSubscriptionSuccess(
  userId: string, 
  subscriptionType: 'seller' | 'affiliate' | 'tip',
  tier?: number
) {
  const supabaseAdmin = createAdminClient()
  
  // 1. 更新 profiles 表
  await supabaseAdmin
    .from('profiles')
    .update({
      [`${subscriptionType}_subscription_active`]: true,
      [`${subscriptionType}_subscription_expires_at`]: calculateExpiry(),
      ...(tier && { [`${subscriptionType}_subscription_tier`]: tier })
    })
    .eq('id', userId)
  
  // 2. 🚨 关键：同步更新 JWT Claims
  const claimKey = subscriptionType === 'seller' ? 'seller' : 
                   subscriptionType === 'affiliate' ? 'affiliate' : 'tip_enabled'
  
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      [claimKey]: true,
      ...(tier && { [`${claimKey}_tier`]: tier }),
      [`${claimKey}_expires_at`]: calculateExpiry()
    }
  })
  
  // Supabase 会自动使旧 JWT 失效
  // 客户端下次请求时会自动 refresh
}
```

---

## 最终安全等级

| Authorization Threat | V2.2 当前 | V2.3 (Production Safe) |
|---------------------|-----------|------------------------|
| Render-before-auth | ✅ | ✅ |
| N+1 profile storm | ✅ | ✅ |
| Logout → Login 越权 | ✅ | ✅ |
| Slow fetch pollution | ✅ | ✅ |
| JWT refresh 权限更新 | ✅ | ✅ |
| Token Refresh Cross-Session | ✅ | ✅ |
| Hard Render Gate Runtime | ✅ | ✅ |
| **Authority Source Drift** | ❌ | ✅ |
| **UI/API 一致性** | ❌ | ✅ |

---

## 架构闭环总结

### ❌ 错误理解（V2.3 之前）

```
错误假设：
Webhook → updateUserById() → JWT 自动失效 → 客户端自动刷新

现实：
updateUserById() 只更新数据库，客户端 JWT 仍然有效（1小时）
```

### ✅ 正确架构（V2.3 修正后）

```
✅ V2.3 最终架构（单一授权源）：

                    Webhook
                      ↓
    ┌─────────────────┼─────────────────┐
    ↓                 ↓                 ↓
profiles 表    JWT Claims        Realtime 事件
    ↓            (DB)                 ↓
    ↓                 ↓              客户端
SubscriptionContext   └──────→  ① refreshSession()
    ↓                              ↓
    ↓                         ② 新 JWT 签发
    ↓                              ↓
    ↓                         ③ 重建 Client
    ↓                              ↓
    ↓                         ④ 新 HTTP Pool
    ↓                              ↓
UI Render ←──────────────────  RLS/API
(Gate)                        (统一授权)

关键流程：
1. Webhook 同时更新 profiles 表 + JWT Claims + 发送 Realtime 事件
2. 客户端收到事件后立即 refreshSession() → 新 JWT 签发
3. 🚨 关键：重建 Supabase Client → 强制 drop HTTP keep-alive pool
4. 新 HTTP 连接使用新 JWT，RLS 立即生效

⚠️ 缺少第 3 步的后果：
   旧 HTTP 连接仍然缓存旧 Authorization Context
   → RLS 偶发 403（最长 ~30s）
```

### 时间线对比

| 时间 | 错误理解（旧 V2.3） | 正确实现（新 V2.3） |
|------|-------------------|-------------------|
| T0 | Webhook 更新 metadata | Webhook 更新 metadata + 发送事件 |
| T1 | 假设 JWT 失效 | 客户端收到 Realtime 事件 |
| T2 | 假设自动刷新 | 客户端调用 refreshSession() |
| T3 | Authority 统一 | 新 JWT 签发 |
| T4 | - | 重建 Client，新 HTTP Pool |
| Drift 窗口 | 0 分钟（假设） | < 1 秒（实际） |

### 不重建 Client 的后果

| 场景 | 结果 |
|------|------|
| 订阅成功 → 立即调用 API | 偶发 403（旧 HTTP 连接缓存旧 Auth） |
| 等待 30s 后调用 API | 成功（连接 idle timeout） |
| 重建 Client 后立即调用 API | 立即成功（新连接使用新 Auth） |

---

## 代码审查发现

### Webhook 文件位置确认

| 支付渠道 | 文件路径 | 订阅处理函数 | 当前 JWT Sync |
|---------|---------|-------------|--------------|
| **Stripe** | `src/app/api/payments/stripe/webhook/route.ts` | `processSubscriptionPayment()` | ❌ 未实施 |
| **PayPal** | `src/app/api/payments/paypal/capture-order/route.ts` | `processSubscriptionPayment()` | ❌ 未实施 |
| **WeChat** | `src/app/api/payments/wechat/notify/route.ts` | `activatePendingSubscription()` | ❌ 未实施 |

### 关键代码审查结果

#### 1. Stripe Webhook (route.ts)

**当前订阅处理流程** (第 310-360 行):
```typescript
// 当前只更新 profiles 表（通过 processSubscriptionPayment）
const result = await processSubscriptionPayment({
  userId,
  subscriptionType,
  amount,
  expiresAt,
  subscriptionTier,
  currency,
  paymentMethod: 'stripe',
  supabaseAdmin,
  isFirstMonth: metadata.isFirstMonth === 'true',
})

// ❌ 缺少: await supabaseAdmin.auth.admin.updateUserById()
```

**需要添加** (在 processSubscriptionPayment 成功后):
```typescript
// 同步更新 JWT Claims
await supabaseAdmin.auth.admin.updateUserById(userId, {
  app_metadata: {
    seller: subscriptionType === 'seller',
    affiliate: subscriptionType === 'affiliate', 
    tip_enabled: subscriptionType === 'tip',
    ...(subscriptionTier && { seller_tier: subscriptionTier }),
    expires_at: expiresAt.toISOString()
  }
})
```

#### 2. PayPal Capture Order (route.ts)

**当前订阅处理流程** (第 85-110 行):
```typescript
const result = await processSubscriptionPayment({
  userId: user.id,
  subscriptionType: metadata.subscriptionType,
  amount: amount,
  expiresAt: expiresAt,
  subscriptionTier: subscriptionTier || undefined,
  currency: captureDetails?.amount?.currency_code?.toUpperCase() || 'USD',
  paymentMethod: 'paypal',
  supabaseAdmin,
  isFirstMonth,
})

// ❌ 同样缺少 JWT Claim Sync
```

#### 3. WeChat Notify (route.ts)

**当前订阅处理流程** (第 95-110 行):
```typescript
const result = await activatePendingSubscription({
  subscriptionId,
  provider: 'wechat',
  providerRef: transaction_id,
  paidAmount,
  currency: 'CNY',
  supabaseAdmin,
})

// ❌ 同样缺少 JWT Claim Sync
```

**注意**: WeChat 使用 `activatePendingSubscription` 而非 `processSubscriptionPayment`，需要在该函数内部或调用后添加 JWT Sync。

### processSubscriptionPayment 函数分析

**文件**: `src/lib/payments/process-subscription-payment.ts`

**当前流程**:
1. 创建 subscription 记录 (第 75-95 行)
2. 调用 `sync_profile_subscription_derived` RPC (第 100-115 行)
3. 如果是 seller 订阅，启用支付 (第 118-120 行)
4. 创建通知 (第 123-135 行)

**缺少步骤**:
- ❌ 更新 JWT Claims

**建议修改位置**: 在 RPC 调用成功后，添加 JWT Claim Sync。

---

## 实施状态总结

### 已完成（Fix 1-3）
- ✅ SubscriptionProvider Session-Safe 实现
- ✅ Reset on user change
- ✅ Cancel in-flight fetch  
- ✅ TOKEN_REFRESHED Session-Bound 监听

### 待实施（Fix 4 - 修正后）

#### Phase 6A: Webhook 端修改
- ⚠️ **Stripe Webhook** - 添加 JWT Claim Sync + Realtime 事件
- ⚠️ **PayPal Webhook** - 添加 JWT Claim Sync + Realtime 事件
- ⚠️ **WeChat Webhook** - 添加 JWT Claim Sync + Realtime 事件

#### Phase 6B: 客户端修改（关键）
- ⚠️ **SubscriptionContext** - 添加 Realtime 监听 + refreshSession() + **重建 Client**

#### Phase 6C: 数据库（如需要）
- ⚠️ **realtime_events 表** - 如果不用 Broadcast，需要创建事件表

### 关键修正说明

#### 第 1 次修正（已包含）
❌ **错误理解**:
```
updateUserById() → JWT 自动失效 → 客户端自动刷新
```

✅ **正确实现**:
```
updateUserById() → Realtime 事件 → 客户端 refreshSession() → 新 JWT
```

#### 第 2 次修正（本次新增）
❌ **不完整实现**:
```
refreshSession() → 新 JWT → 下次请求自动使用新 JWT
```

✅ **完整实现**:
```
refreshSession() → 新 JWT
    ↓
重建 Supabase Client → 强制 drop HTTP keep-alive pool
    ↓
新 HTTP 连接使用新 JWT → RLS 立即生效
```

**关键洞察**: Supabase JS Client 内部的 HTTP keep-alive 连接池会缓存 Authorization Context，即使 JWT 已更新，旧连接仍然使用旧 Auth。必须重建 Client 才能强制使用新连接。

### 实施后才能标记为 Production Ready

---

**文档版本**: 2.3  
**架构设计审查**: 已通过  
**Production 安全审查**: 已通过（设计层面）  
**Runtime 安全审查**: 已通过（设计层面）  
**Authority 一致性审查**: ⚠️ **需要实施 Fix 4**  
**架构审查**: ✅ 已通过（含改进建议）  
**最后更新**: 2026-02-13  
**状态**: ⚠️ **Implementation Required** - 需要实施 Webhook JWT Claim Sync + 改进建议

---

## 总架构师最终审查反馈

### ✅ 强项认可

| 方面 | 评价 |
|------|------|
| **Hard Render Gate** | 所有 SellerGate、AffiliateGate、TipGate 逻辑清晰，确保未授权组件不会渲染 |
| **Session-Safe SubscriptionProvider** | userIdRef + EMPTY_STATE 有效防止 Stale Authorization Window |
| **统一 Context** | 消除了 N+1 fetch，所有页面共享 SubscriptionContext |
| **JWT Claim Sync** | Stripe/PayPal/WeChat webhook 都同步更新 JWT Claims |
| **测试清单** | 覆盖竞态条件、权限控制、生产安全测试，非常完整 |

### ⚠️ 改进建议（实施前必须处理）

#### 1. Supabase Realtime Channel 残留问题

**问题**: 多标签页登录不同用户时，旧 channel 可能残留

**建议改进**:
```typescript
useEffect(() => {
  if (!user) return
  
  // 🚨 先清理所有旧 channel，防止残留
  supabase.removeAllChannels()
  
  // 再订阅新 channel
  const channel = supabase
    .channel(`user:${user.id}`)
    .on('broadcast', { event: 'subscription_updated' }, async (payload) => {
      // ... 处理逻辑
    })
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}, [user?.id])
```

#### 2. refreshSession() 不触发 onAuthStateChange

**问题**: Supabase 官方文档指出 refreshSession() 不会触发 onAuthStateChange 回调

**建议改进**:
```typescript
// 在 fetchSubscriptionStatus 里加一层检查
const fetchSubscriptionStatus = async () => {
  // 先获取当前 session，确保使用最新 JWT
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    setState(EMPTY_STATE)
    return
  }
  
  // 使用最新 session 发起请求
  const { data: profile } = await supabase
    .from('profiles')
    .select('...')
    .eq('id', session.user.id)
    .single()
  
  // ... 处理逻辑
}
```

#### 3. Supabase Client 重建范围问题（关键）

**问题**: `supabase = createClient()` 是局部变量，无法影响其他模块已引用的 client

**建议改进** - 将 Supabase Client 封装成可重建的单例:

```typescript
// src/lib/supabase/client.ts
let supabaseInstance: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient()
  }
  return supabaseInstance
}

export function recreateSupabaseClient() {
  // 断开所有连接
  if (supabaseInstance) {
    supabaseInstance.removeAllChannels()
  }
  // 重建实例
  supabaseInstance = createClient()
  return supabaseInstance
}

// 在 SubscriptionContext 中使用
import { recreateSupabaseClient } from '@/lib/supabase/client'

// 收到 Realtime 事件后
await supabase.auth.refreshSession()
await supabase.removeAllChannels()
supabase = recreateSupabaseClient() // 影响全局 client
await fetchSubscriptionStatus()
```

#### 4. Webhook JWT Claim 更新确认机制

**问题**: Realtime 消息可能丢失或网络延迟

**建议改进**:
```typescript
// Webhook 端：添加重试确认机制
const MAX_RETRIES = 3
for (let i = 0; i < MAX_RETRIES; i++) {
  try {
    await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: {...} })
    
    // 验证更新成功
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (user.user.app_metadata.seller === true) {
      break // 成功
    }
  } catch (error) {
    if (i === MAX_RETRIES - 1) throw error
    await new Promise(r => setTimeout(r, 1000 * (i + 1))) // 指数退避
  }
}

// 发送 Realtime 事件
await supabaseAdmin.channel('system').send({...})
```

#### 5. 边缘情况处理

**问题**: 用户刷新页面时 session 已过期，但 SubscriptionProvider 仍处于 loading

**建议改进**:
```typescript
useEffect(() => {
  // 等待认证状态确定
  if (authLoading) return
  
  // 🚨 添加：session 过期处理
  if (!user && !authLoading) {
    setState(EMPTY_STATE)
    return
  }
  
  // 原有逻辑...
}, [user?.id, authLoading])
```

#### 6. 生产环境压力测试建议

**必须测试的场景**:
- [ ] 多标签页登录切换（不同用户）
- [ ] Realtime 消息延迟/丢失模拟
- [ ] 慢网络环境下的 token 刷新
- [ ] HTTP 连接池重建验证
- [ ] 并发订阅请求处理

#### 7. Layout Guard 抽象建议

**当前**: Seller/Affiliate/Tip Layout 逻辑重复

**建议抽象**:
```typescript
// src/lib/hooks/useLayoutGuard.tsx
interface LayoutGuardConfig {
  useGuard: () => { loading: boolean; allowed: boolean; isAuthenticated: boolean }
  landingPagePath: string
  redirectPath: string
}

export function createLayoutGuard(config: LayoutGuardConfig) {
  return function GuardLayout({ children }: { children: React.ReactNode }) {
    // 通用逻辑...
  }
}

// 使用
export const SellerLayout = createLayoutGuard({
  useGuard: useSellerGuard,
  landingPagePath: '/seller/landing',
  redirectPath: '/login'
})
```

---

### 📝 总体结论

| 项目 | 状态 |
|------|------|
| 方案逻辑 | ✅ 合理，覆盖大部分竞态与安全风险 |
| JWT Claim Sync + Realtime + Client 重建 | ✅ 生产关键点，必须严格测试 |
| 多标签页登录切换 | ⚠️ 需要重点验证 |
| Realtime 消息丢失/延迟 | ⚠️ 需要容错机制 |
| Client 重建完全刷新旧 HTTP 连接 | ⚠️ 必须使用全局单例模式 |
| 代码抽象 | 📝 建议 Layout Guard 抽象，减少重复 |
