'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useAuth } from './useAuth'
import { createClient } from '@/lib/supabase/client'

export interface UseAdminGuardOptions {
  redirectTo?: string
  /** require admin only (exclude support). Default false = admin or support */
  requireAdminOnly?: boolean
}

/**
 * 前端 Admin 守卫：校验当前用户为 admin 或 support，否则重定向。
 * 与 API 端 requireAdmin / requireAdminOrSupport 对应。
 */
export function useAdminGuard(options: UseAdminGuardOptions = {}) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { redirectTo = '/', requireAdminOnly = false } = options
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (authLoading) return

      if (!user) {
        const loginUrl = `/login?redirect=${encodeURIComponent(pathname)}`
        router.push(loginUrl)
        return
      }

      try {
        const supabase = createClient()
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (error || !profile) {
          setIsAdmin(false)
          setChecking(false)
          router.push(redirectTo)
          return
        }

        const allowed = requireAdminOnly
          ? profile.role === 'admin'
          : profile.role === 'admin' || profile.role === 'support'
        setIsAdmin(allowed)
        setChecking(false)

        if (!allowed) {
          router.push(redirectTo)
        }
      } catch {
        setIsAdmin(false)
        setChecking(false)
        router.push(redirectTo)
      }
    }

    checkAdminStatus()
  }, [user, authLoading, requireAdminOnly, redirectTo, pathname, router])

  return {
    user,
    loading: authLoading || checking,
    isAuthenticated: !!user,
    isAdmin: isAdmin === true,
  }
}
