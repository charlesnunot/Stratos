'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Session } from '@supabase/supabase-js'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { validateRedirectUrl } from '@/lib/utils/redirect'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const t = useTranslations('auth')

  // 错误映射函数
  const getErrorMessage = (error: any): string => {
    const code = error.code || error.message || ''
    const message = error.message || ''
    
    if (code.includes('invalid_credentials') || code.includes('Invalid login') || message.includes('Invalid login')) {
      return t('invalidCredentials')
    }
    if (code.includes('email_not_confirmed') || message.includes('Email not confirmed')) {
      return t('emailNotConfirmed')
    }
    if (code.includes('too_many_requests') || message.includes('too many requests')) {
      return t('tooManyRequests')
    }
    if (message.includes('Session creation timeout')) {
      return t('sessionTimeout')
    }
    
    return message || t('loginFailed')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      // 优先使用响应中的会话
      let session: Session | null = signInData?.session ?? null

      // 如果没有会话，尝试获取（作为后备方案）
      if (!session) {
        const { data: sessionData } = await supabase.auth.getSession()
        session = sessionData?.session ?? null
      }

      // 如果仍然没有会话，说明登录失败
      if (!session) {
        throw new Error('Session not created after login')
      }

      // 验证并获取重定向 URL
      const redirectParam = searchParams.get('redirect')
      const redirect = validateRedirectUrl(redirectParam, '/')

      router.push(redirect)
      router.refresh() // 刷新服务端状态
    } catch (error: any) {
      setError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('login')}</CardTitle>
          <CardDescription>{t('loginDescription')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                {t('email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="your@email.com"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  {t('password')}
                </label>
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  {t('forgotPassword')}
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="••••••••"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('loggingIn') : t('login')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('dontHaveAccount')}{' '}
              <Link href="/register" className="text-primary hover:underline">
                {t('register')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
