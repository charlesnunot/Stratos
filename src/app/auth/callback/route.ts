import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const origin = requestUrl.origin

  // 处理密码重置回调
  if (type === 'recovery') {
    if (code) {
      const supabase = await createClient()
      await supabase.auth.exchangeCodeForSession(code)
    }
    return NextResponse.redirect(new URL('/reset-password', origin))
  }

  // 处理注册验证等其他情况
  if (code) {
    const supabase = await createClient()
    // 只做 session 交换，profile 由数据库触发器自动创建
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL('/', origin))
}
