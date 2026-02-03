/**
 * 仅开发/测试环境：用邮箱密码换取 session（写入 Cookie）。
 * 用于自动化脚本「真实用户」测试，生产环境不可用。
 *
 * POST /api/test/session
 * Body: { email: string, password: string }
 * 成功：200 + Set-Cookie（session），body { ok: true, userId }
 * 失败：401 或 404（接口关闭）
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOW_TEST_SESSION =
  process.env.NODE_ENV === 'development' || process.env.TEST_MODE === '1'

export async function POST(request: NextRequest) {
  if (!ALLOW_TEST_SESSION) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Invalid credentials' },
      { status: 401 }
    )
  }

  if (!data.session?.user?.id) {
    return NextResponse.json({ error: 'No session' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    userId: data.session.user.id,
    email: data.session.user.email,
  })
}
