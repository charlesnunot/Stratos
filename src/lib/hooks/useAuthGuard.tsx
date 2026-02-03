'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useAuth } from './useAuth'

interface UseAuthGuardOptions {
  redirectTo?: string
  requireAuth?: boolean
}

export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { redirectTo = '/login', requireAuth = true } = options

  useEffect(() => {
    if (loading) return // 等待认证状态加载

    if (requireAuth && !user) {
      // pathname 来自 next-intl，已不含 locale（如 /post/create）；登录页会据此跳回，不会出现 /en/en/
      const redirectUrl = `${redirectTo}?redirect=${encodeURIComponent(pathname)}`
      router.push(redirectUrl)
    }
  }, [user, loading, requireAuth, redirectTo, pathname, router])

  return { user, loading, isAuthenticated: !!user }
}
