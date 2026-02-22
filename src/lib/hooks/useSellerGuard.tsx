'use client'

import { useAuth } from './useAuth'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { Loader2 } from 'lucide-react'

interface UseSellerGuardResult {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isAuthenticated: boolean
  isSeller: boolean
  allowed: boolean
}

/**
 * 卖家路由守卫钩子（Render Gate 模式）
 * V2.3 改进：使用 Context 而非独立请求，避免竞态条件
 */
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

/**
 * 卖家布局守卫组件（Hard Render Gate）
 * 权限确认前不渲染任何业务组件
 */
export function SellerGate({ children }: { children: React.ReactNode }) {
  const { loading, allowed } = useSellerGuard()

  // Hard Render Gate: 加载中显示 loading 状态
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Hard Render Gate: 未授权不渲染业务组件
  if (!allowed) {
    return null
  }

  return <>{children}</>
}
