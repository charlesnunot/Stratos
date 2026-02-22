'use client'

import {
  createContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { showInfo } from '@/lib/utils/toast'

function isAuthAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string })?.name ?? ''
  const msg = String((err as { message?: string })?.message ?? '')
  return (
    name === 'AbortError' ||
    msg.includes('aborted') ||
    msg.includes('cancelled') ||
    msg === 'signal is aborted without reason'
  )
}

export interface AuthContextValue {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])
  const userRef = useRef<User | null>(null)
  
  // 获取当前语言设置
  const getLocale = (): string => {
    if (typeof document === 'undefined') return 'zh'
    return document.documentElement.lang || 'zh'
  }

  // 获取翻译后的消息
  const getMessage = (key: 'sessionExpired' | 'info'): string => {
    const locale = getLocale()
    const messages: Record<string, Record<string, string>> = {
      zh: {
        sessionExpired: '您的登录已过期，请重新登录',
        info: '提示',
      },
      en: {
        sessionExpired: 'Your session has expired, please sign in again',
        info: 'Info',
      },
    }
    return messages[locale]?.[key] || messages['zh'][key]
  }

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    let mounted = true
    let subscription: { unsubscribe: () => void } | null = null

    const getSessionSafe = (): Promise<{ data: { session: { user?: User } | null }; error: unknown }> =>
      supabase.auth.getSession().then(
        (res) => res,
        (err: unknown) => {
          if (isAuthAbortError(err)) {
            return { data: { session: null }, error: null }
          }
          return Promise.reject(err)
        }
      )

    getSessionSafe()
      .then(({ data: { session }, error }) => {
        if (!mounted) return

        if (error) {
          if (isAuthAbortError(error)) {
            if (mounted) {
              setUser(session?.user ?? null)
              setLoading(false)
            }
            return
          }
          console.error('getSession error:', error)
        }

        if (mounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return
        if (isAuthAbortError(err)) {
          if (mounted) setLoading(false)
          return
        }
        console.error('getSession catch error:', err)
        if (mounted) setLoading(false)
      })

    try {
      const {
        data: { subscription: authSubscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return

        const currentUser = userRef.current
        if (event === 'SIGNED_OUT' && currentUser) {
          showInfo(getMessage('sessionExpired'), getMessage('info'))
        }

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

  const value = useMemo<AuthContextValue>(() => ({ user, loading }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export { AuthContext }
