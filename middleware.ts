import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './src/i18n/routing'
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

  // 先更新 Supabase 会话
  const response = await updateSession(request)
  
  // 然后应用国际化中间件
  return intlMiddleware(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes: webhooks, callbacks, cron must not go through i18n)
     * - _next/static, _next/image (static files)
     * - favicon.ico, images (.*\.(svg|png|...))
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
