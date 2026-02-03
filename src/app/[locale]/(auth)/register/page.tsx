'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | null>(null)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('auth')

  // Password strength validation
  const validatePasswordStrength = (pwd: string): 'weak' | 'medium' | 'strong' => {
    if (pwd.length < 8) return 'weak'
    const hasLower = /[a-z]/.test(pwd)
    const hasUpper = /[A-Z]/.test(pwd)
    const hasNumber = /[0-9]/.test(pwd)
    const hasSpecial = /[^a-zA-Z0-9]/.test(pwd)
    
    const score = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length
    if (score >= 3) return 'strong'
    if (score >= 2) return 'medium'
    return 'weak'
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pwd = e.target.value
    setPassword(pwd)
    if (pwd.length > 0) {
      setPasswordStrength(validatePasswordStrength(pwd))
    } else {
      setPasswordStrength(null)
    }
  }

  // 已登录用户访问注册页时重定向到首页
  useEffect(() => {
    const checkAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/')
        router.refresh()
      }
    }
    checkAndRedirect()
  }, [supabase.auth, router])

  // 用户名可用性检查（防抖）
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null)
      return
    }

    const timeoutId = setTimeout(async () => {
      setCheckingUsername(true)
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle()

        if (error && error.code !== 'PGRST116') {
          console.error('Username check error:', error)
          setUsernameAvailable(null)
        } else {
          setUsernameAvailable(!data)
        }
      } catch (error) {
        console.error('Username check failed:', error)
        setUsernameAvailable(null)
      } finally {
        setCheckingUsername(false)
      }
    }, 500) // 500ms 防抖

    return () => clearTimeout(timeoutId)
  }, [username, supabase])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    // 客户端验证（用户体验）
    if (password.length < 6) {
      setError(t('passwordTooShort'))
      setLoading(false)
      return
    }

    if (passwordStrength === 'weak' && password.length >= 6) {
      setError(t('passwordWeakHint'))
      setLoading(false)
      return
    }

    try {
      // 后端验证密码强度（防止绕过）
      const passwordValidationResponse = await fetch('/api/auth/validate-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const passwordValidation = await passwordValidationResponse.json()

      if (!passwordValidation.valid) {
        setError(
          passwordValidation.errors?.join(' ') ||
          t('passwordStrengthRequired')
        )
        setLoading(false)
        return
      }
      // Register user
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '')
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${baseUrl.replace(/\/$/, '')}/auth/callback`,
          data: {
            username: username,
          },
        },
      })

      if (authError) {
        throw authError
      }

      if (!authData.user) {
        throw new Error(t('userCreationFailed'))
      }

      // Profile 将由数据库触发器自动创建，无需手动处理

      // 检查是否需要邮箱验证
      if (authData.user && !authData.session) {
        setSuccess(true)
        setError(null)
        // 明确提示用户需要验证邮箱
        // 不立即跳转，让用户看到提示（已在 success 消息中提示）
        setTimeout(() => {
          router.push('/login')
        }, 5000) // 延长到5秒，让用户有时间阅读提示
      } else {
        setSuccess(true)
        setError(null)
        setTimeout(() => {
          router.push('/')
          router.refresh()
        }, 1000)
      }
    } catch (error: any) {
      setError(error.message || t('registerFailed'))
      setSuccess(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('register')}</CardTitle>
          <CardDescription>{t('registerDescription')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-900 dark:text-green-50 space-y-2">
                <p className="font-semibold">{t('registerSuccess')}</p>
                <p className="text-xs">{t('registerSuccessEmailHint')}</p>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                {t('username')}
              </label>
              <div className="space-y-1">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${
                    usernameAvailable === false ? 'border-destructive' :
                    usernameAvailable === true ? 'border-green-500' : ''
                  }`}
                  placeholder={t('usernamePlaceholder')}
                />
                {checkingUsername && (
                  <p className="text-xs text-muted-foreground">{t('checkingUsername')}</p>
                )}
                {!checkingUsername && username && username.length >= 3 && usernameAvailable === false && (
                  <p className="text-xs text-destructive">{t('usernameTaken')}</p>
                )}
                {!checkingUsername && username && username.length >= 3 && usernameAvailable === true && (
                  <p className="text-xs text-green-600">{t('usernameAvailable')}</p>
                )}
              </div>
            </div>
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
                placeholder={t('emailPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  {t('password')}
                </label>
                {passwordStrength && (
                  <span className={`text-xs ${
                    passwordStrength === 'strong' ? 'text-green-600' :
                    passwordStrength === 'medium' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {passwordStrength === 'strong' ? t('passwordStrengthStrong') :
                     passwordStrength === 'medium' ? t('passwordStrengthMedium') : t('passwordStrengthWeak')}
                  </span>
                )}
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                required
                minLength={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={t('passwordPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('passwordHint')}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('registering') : t('register')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('alreadyHaveAccount')}{' '}
              <Link href="/login" className="text-primary hover:underline">
                {t('login')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
