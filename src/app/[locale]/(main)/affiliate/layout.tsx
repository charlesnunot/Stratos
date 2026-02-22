'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { useAffiliateGuard } from '@/lib/hooks/useAffiliateGuard'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'

/**
 * 带货区布局（V2.3 统一鉴权系统）
 * - 使用 Hard Render Gate 模式
 * - 权限确认前不渲染业务组件
 */
export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { loading, allowed, isAuthenticated } = useAffiliateGuard()

  // 使用 useEffect 处理重定向（避免同步 redirect 导致的竞态条件）
  useEffect(() => {
    if (loading) return
    
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }
    
    if (!allowed) {
      router.push('/subscription/affiliate')
    }
  }, [loading, allowed, isAuthenticated, pathname, router])

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
