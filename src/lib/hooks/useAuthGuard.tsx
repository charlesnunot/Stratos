'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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
      // 保存原始路径以便登录后重定向回来
      const redirectUrl = `${redirectTo}?redirect=${encodeURIComponent(pathname)}`
      router.push(redirectUrl)
    }
  }, [user, loading, requireAuth, redirectTo, pathname, router])

  return { user, loading, isAuthenticated: !!user }
}
