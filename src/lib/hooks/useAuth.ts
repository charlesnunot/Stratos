'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { showInfo } from '@/lib/utils/toast'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])
  const userRef = useRef<User | null>(null)

  // 同步 userRef 与 user 状态
  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    let mounted = true
    let subscription: { unsubscribe: () => void } | null = null

    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return
        
        // 忽略 AbortError
        if (error) {
          const errorMessage = error.message || ''
          const errorName = (error as any)?.name || ''
          
          if (
            errorName === 'AbortError' ||
            errorMessage.includes('aborted') ||
            errorMessage.includes('cancelled') ||
            errorMessage === 'signal is aborted without reason'
          ) {
            // 请求被取消，这是正常的，不需要处理
            return
          }
          
          // 其他错误，记录但不阻止状态更新
          console.error('getSession error:', error)
        }
        
        // 使用函数式更新确保状态一致性
        if (mounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      })
      .catch((err: any) => {
        if (!mounted) return
        
        // 忽略 AbortError
        if (
          err?.name === 'AbortError' ||
          err?.message?.includes('aborted') ||
          err?.message?.includes('cancelled') ||
          err?.message === 'signal is aborted without reason'
        ) {
          return
        }
        
        console.error('getSession catch error:', err)
        if (mounted) {
          setLoading(false)
        }
      })

    // Listen for auth changes
    try {
      const {
        data: { subscription: authSubscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return
        
        // Handle session expiration
        const currentUser = userRef.current
        if (event === 'SIGNED_OUT' && currentUser) {
          // Only show message if user was previously logged in
          showInfo('您的登录已过期，请重新登录')
        } else if (event === 'TOKEN_REFRESHED') {
          // Token refreshed successfully, no action needed
        } else if (event === 'USER_UPDATED') {
          // User data updated, update state
        }
        
        // 使用函数式更新确保状态一致性
        if (mounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      })
      
      subscription = authSubscription
    } catch (err) {
      console.error('onAuthStateChange error:', err)
      if (mounted) {
        setLoading(false)
      }
    }

    return () => {
      mounted = false
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [supabase])

  return { user, loading }
}
