'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useAuth } from './useAuth'
import { createClient } from '@/lib/supabase/client'

interface UseSellerGuardOptions {
  redirectTo?: string
  requireSeller?: boolean
}

export function useSellerGuard(options: UseSellerGuardOptions = {}) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { redirectTo = '/', requireSeller = true } = options
  const [isSeller, setIsSeller] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkSellerStatus = async () => {
      if (authLoading) return

      if (!user) {
        // 未登录，重定向到登录页
        const loginUrl = `/login?redirect=${encodeURIComponent(pathname)}`
        router.push(loginUrl)
        return
      }

      if (!requireSeller) {
        setIsSeller(true)
        setChecking(false)
        return
      }

      // 检查用户是否有有效卖家订阅（统一以 subscriptions 为准，与首页逻辑一致）
      try {
        const supabase = createClient()
        const { data: sellerSubscription, error } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .eq('subscription_type', 'seller')
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle()

        if (error) {
          console.error('Failed to fetch seller subscription:', error)
          setIsSeller(false)
          setChecking(false)
          if (requireSeller) {
            router.push(redirectTo)
          }
          return
        }

        const sellerStatus = !!sellerSubscription
        setIsSeller(sellerStatus)
        setChecking(false)

        if (requireSeller && !sellerStatus) {
          router.push(redirectTo)
        }
      } catch (error) {
        console.error('Error checking seller status:', error)
        setIsSeller(false)
        setChecking(false)
        if (requireSeller) {
          router.push(redirectTo)
        }
      }
    }

    checkSellerStatus()
  }, [user, authLoading, requireSeller, redirectTo, pathname, router])

  return {
    user,
    loading: authLoading || checking,
    isAuthenticated: !!user,
    isSeller: isSeller === true,
  }
}
