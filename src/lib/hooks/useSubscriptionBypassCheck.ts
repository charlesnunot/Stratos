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