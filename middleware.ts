import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './src/i18n/routing'
import { defaultLocale, locales } from '@/i18n/config'
import { validateEnvOrThrow } from '@/lib/env/validate'

// Validate environment variables on first middleware call (startup)
let envValidated = false
let envValidationError: Error | null = null

if (!envValidated) {
  try {
    validateEnvOrThrow()
    envValidated = true
  } catch (error: any) {
    envValidationError = error
    console.error('❌ Environment validation failed:', error.message)
    
    // In production, log error and mark as failed (don't throw to allow graceful degradation)
    if (process.env.NODE_ENV === 'production') {
      console.error(
        `⚠️  Application running with missing environment variables: ${error.message}. ` +
        'Please check your environment variables configuration. ' +
        'The application will return 503 for all requests until this is fixed.'
      )
      // Don't throw - instead, we'll return 503 in middleware for all requests
    } else {
      // In development, log warning but continue (for easier development)
      console.warn('⚠️  Continuing in development mode despite missing environment variables')
      console.warn('   Missing variables:', error.message)
    }
  }
}

const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  // 如果环境变量验证失败，返回 503 Service Unavailable
  if (envValidationError && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: 'Service Unavailable',
        message: 'Application configuration error. Please contact support.',
      },
      { status: 503 }
    )
  }

  // 生产环境强制 HTTPS（确保密码及敏感数据传输加密）
  if (process.env.NODE_ENV === 'production') {
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
    if (proto === 'http') {
      const url = request.nextUrl.clone()
      url.protocol = 'https:'
      return NextResponse.redirect(url, 301)
    }
  }

  // 先更新 Supabase 会话（降级容错：任何异常都不应阻断 i18n 与页面访问）
  // 关键：updateSession 返回的 response 包含更新后的 session cookies
  let sessionResponse: NextResponse | null = null
  try {
    sessionResponse = await updateSession(request)
    // 如果 updateSession 返回了重定向（如被封禁用户），直接返回
    if (sessionResponse && sessionResponse.status >= 300 && sessionResponse.status < 400) {
      return sessionResponse
    }
  } catch (error: any) {
    console.error('[middleware] updateSession failed:', error?.message || error)
  }

  // 无有效 locale 前缀的路径重定向到 /{defaultLocale}/...，与 [locale] layout 的 notFound() 逻辑一致，避免 404
  const pathname = request.nextUrl.pathname
  const segments = pathname.split('/').filter(Boolean)
  const firstSegment = segments[0]
  const hasValidLocale = firstSegment != null && locales.includes(firstSegment as (typeof locales)[number])
  if (!hasValidLocale && segments.length > 0) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.startsWith('/') ? `/${defaultLocale}${pathname}` : `/${defaultLocale}/${pathname}`
    url.search = request.nextUrl.search
    return NextResponse.redirect(url, 307)
  }

  // 然后应用国际化中间件
  const response = await intlMiddleware(request)
  
  // 合并 session cookies 到最终响应
  // 关键：确保 Supabase 设置的 session cookies 被传递到客户端
  if (sessionResponse && response) {
    const finalHeaders = new Headers(response.headers)
    
    // 复制 sessionResponse 中的所有 Set-Cookie headers
    sessionResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        finalHeaders.append(key, value)
      }
    })
    
    // 生产环境添加 HSTS 头
    if (process.env.NODE_ENV === 'production') {
      finalHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    }
    
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: finalHeaders,
    })
  }
  
  // 生产环境添加 HSTS 头
  if (process.env.NODE_ENV === 'production' && response) {
    const headers = new Headers(response.headers)
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
  return response
}

export const config = {
  matcher: [
    // 显式匹配无 locale 的 profile 路径，确保重定向生效
    '/profile',
    '/profile/:path*',
    /*
     * 其余路径（排除 api、静态资源等）
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
