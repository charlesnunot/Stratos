import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Check if user is banned (single profile query per authenticated request)
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .single()

    if (profile?.status === 'banned' || profile?.status === 'suspended') {
      const url = new URL(request.url)
      const bannedUrl = new URL('/banned', url.origin)
      // Preserve locale if present (support all routing locales: en, zh, es, pt, ja, ar)
      const pathname = url.pathname
      const localeMatch = pathname.match(/^\/(en|zh|es|pt|ja|ar)(\/|$)/)
      if (localeMatch) {
        bannedUrl.pathname = `/${localeMatch[1]}/banned`
      }
      return NextResponse.redirect(bannedUrl)
    }
    // Removed tip subscription check: it only logged inconsistency, never blocked.
    // Pages validate tip/subscription; cron syncs profile. Saves 1 DB query per tip user.
  }

  return response
}
