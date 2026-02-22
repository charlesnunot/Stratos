'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useSellerGuard } from '@/lib/hooks/useSellerGuard'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

/**
 * 卖家区布局（V2.3 统一鉴权系统）
 * - 宣传页面不需要卖家身份验证
 * - 收款账户页面允许已订阅打赏的用户访问
 * - 其他页面使用 Hard Render Gate 模式
 * - 权限确认前不渲染业务组件
 */
export default function SellerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isLandingPage = pathname === '/seller/landing' || pathname.endsWith('/seller/landing')
  const isPaymentAccountsPage = pathname === '/seller/payment-accounts' || pathname.endsWith('/seller/payment-accounts')
  
  const { loading: sellerLoading, allowed: sellerAllowed, isAuthenticated } = useSellerGuard()
  const { isTipEnabled, isLoading: tipLoading } = useSubscription()
  
  // 对于收款账户页面，已订阅打赏的用户也可以访问
  const loading = sellerLoading || tipLoading
  const allowed = sellerAllowed || (isPaymentAccountsPage && isTipEnabled)

  // 使用 useEffect 处理重定向（避免同步 redirect 导致的竞态条件）
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

  // Hard Render Gate: 加载中显示 loading
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
