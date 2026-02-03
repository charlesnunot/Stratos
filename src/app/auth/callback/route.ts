import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { defaultLocale, isValidLocale } from '@/i18n/config'

const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

/**
 * 认证回调处理
 * 处理邮箱验证、密码重置等认证流程的回调
 * 
 * 链路追踪：
 * - 入口：Supabase 发送的验证邮件中的链接
 * - 处理：验证 code 并交换 session
 * - 输出：重定向到相应页面，带有错误参数（如果有）
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const origin = requestUrl.origin

  // 读取 next-intl 的 locale cookie，保留用户语言
  let locale = defaultLocale
  try {
    const cookieStore = await cookies()
    const localeCookie = cookieStore.get(LOCALE_COOKIE_NAME)
    if (localeCookie?.value && isValidLocale(localeCookie.value)) {
      locale = localeCookie.value
    }
  } catch {
    // 忽略 cookie 读取失败
  }

  // 处理 Supabase 返回的错误（如链接过期、无效等）
  if (error) {
    console.error('[auth/callback] Auth error:', { error, errorDescription, type })
    const errorUrl = new URL(`/${locale}/login`, origin)
    errorUrl.searchParams.set('error', error)
    if (errorDescription) {
      errorUrl.searchParams.set('error_description', errorDescription)
    }
    return NextResponse.redirect(errorUrl)
  }

  // 处理密码重置回调
  if (type === 'recovery') {
    if (code) {
      try {
        const supabase = await createClient()
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        
        if (exchangeError) {
          console.error('[auth/callback] Recovery code exchange failed:', exchangeError.message)
          const errorUrl = new URL(`/${locale}/login`, origin)
          errorUrl.searchParams.set('error', 'recovery_failed')
          errorUrl.searchParams.set('error_description', exchangeError.message)
          return NextResponse.redirect(errorUrl)
        }
        
        console.log('[auth/callback] Recovery session established successfully')
      } catch (err: any) {
        console.error('[auth/callback] Recovery exception:', err?.message || err)
        const errorUrl = new URL(`/${locale}/login`, origin)
        errorUrl.searchParams.set('error', 'recovery_exception')
        return NextResponse.redirect(errorUrl)
      }
    } else {
      // 没有 code 的 recovery 请求
      console.warn('[auth/callback] Recovery request without code')
      const errorUrl = new URL(`/${locale}/login`, origin)
      errorUrl.searchParams.set('error', 'missing_code')
      return NextResponse.redirect(errorUrl)
    }
    return NextResponse.redirect(new URL(`/${locale}/reset-password`, origin))
  }

  // 处理注册验证等其他情况
  if (code) {
    try {
      const supabase = await createClient()
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (exchangeError) {
        console.error('[auth/callback] Code exchange failed:', exchangeError.message)
        const errorUrl = new URL(`/${locale}/login`, origin)
        errorUrl.searchParams.set('error', 'verification_failed')
        errorUrl.searchParams.set('error_description', exchangeError.message)
        return NextResponse.redirect(errorUrl)
      }
      
      console.log('[auth/callback] Session established successfully')
    } catch (err: any) {
      console.error('[auth/callback] Session exchange exception:', err?.message || err)
      const errorUrl = new URL(`/${locale}/login`, origin)
      errorUrl.searchParams.set('error', 'verification_exception')
      return NextResponse.redirect(errorUrl)
    }
  }

  return NextResponse.redirect(new URL(`/${locale}`, origin))
}
