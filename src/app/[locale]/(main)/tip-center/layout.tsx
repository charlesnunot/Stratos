'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useTipGuard } from '@/lib/hooks/useTipGuard'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

/**
 * 打赏中心布局（V2.3 统一鉴权系统）
 * - 使用 Hard Render Gate 模式
 * - 权限确认前不渲染业务组件
 */
export default function TipCenterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { loading, allowed, isAuthenticated, denyReason } = useTipGuard()

  // 使用 useEffect 处理重定向（避免同步 redirect 导致的竞态条件）
  useEffect(() => {
    if (loading) return
    
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }
    
    if (!allowed) {
      // 根据拒绝原因跳转到不同页面
      if (denyReason === 'no_payment_account') {
        // 已订阅但缺少收款账户，跳转到收款账户绑定页面
        router.push('/seller/payment-accounts')
      } else {
        // 未订阅或其他原因，跳转到订阅页面
        router.push('/subscription/tip')
      }
    }
  }, [loading, allowed, isAuthenticated, denyReason, pathname, router])

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
