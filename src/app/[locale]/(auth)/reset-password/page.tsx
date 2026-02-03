'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('auth')

  useEffect(() => {
    // 检查是否有有效的 session（来自密码重置链接）
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // 如果没有 session，重定向到登录页面
        router.push('/login')
      }
    }
    checkSession()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      if (password !== confirmPassword) {
        throw new Error(t('passwordMismatch'))
      }

      // 与注册一致：使用 /api/auth/validate-password 校验密码强度
      const validationRes = await fetch('/api/auth/validate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const validation = await validationRes.json()
      if (!validation.valid) {
        setError(
          validation.errors?.join(' ') ??
            t('passwordTooShort') ??
            '密码强度不足，请使用更强的密码'
        )
        setLoading(false)
        return
      }

      // 更新密码
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      setSuccess(true)

      // 3秒后跳转到登录页面
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (error: any) {
      setError(error.message || t('passwordResetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('resetPasswordTitle')}</CardTitle>
          <CardDescription>{t('resetPasswordDescription')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success ? (
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-900 dark:text-green-50">
                {t('passwordResetSuccess')}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    {t('newPassword')}
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={t('passwordPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium">
                    {t('confirmNewPassword')}
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={t('passwordPlaceholder')}
                  />
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {!success && (
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('settingNewPassword') : t('resetPassword')}
              </Button>
            )}
            {success && (
              <p className="text-center text-sm text-muted-foreground">
                {t('passwordResetSuccessDescription')}
              </p>
            )}
            <Link
              href="/login"
              className="text-center text-sm text-primary hover:underline"
            >
              {t('backToLogin')}
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
