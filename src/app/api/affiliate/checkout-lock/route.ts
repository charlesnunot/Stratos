import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'

const LOCK_EXPIRY_MINUTES = 30

function generateVisitorId(request: NextRequest): string {
  const ip = getClientIP(request)
  const ua = request.headers.get('user-agent') || ''
  const acceptLanguage = request.headers.get('accept-language') || ''
  return createHash('sha256')
    .update(`${ip}|${ua}|${acceptLanguage}`)
    .digest('hex')
    .substring(0, 32)
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }
  return 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户（可能为空）
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    // 读取 click_id Cookie
    const clickId = request.cookies.get('affiliate_click_id')?.value
    
    if (!clickId) {
      return NextResponse.json({ 
        locked: false, 
        reason: 'no_click' 
      })
    }

    // 获取 visitor_id
    let visitorId = request.cookies.get('affiliate_visitor_id')?.value
    if (!visitorId) {
      visitorId = generateVisitorId(request)
    }

    // 计算锁过期时间
    const expiresAt = new Date(Date.now() + LOCK_EXPIRY_MINUTES * 60 * 1000)

    const admin = await getSupabaseAdmin()

    // 🔒 原子操作：创建 lock（验证 click 有效性）
    const { data: lock, error } = await admin.rpc('create_checkout_lock', {
      p_click_id: clickId,
      p_visitor_id: visitorId,
      p_user_id: user?.id || null,
      p_expires_at: expiresAt.toISOString()
    })

    if (error) {
      console.error('[affiliate/checkout-lock] Error creating lock:', error)
      return NextResponse.json({ 
        locked: false, 
        reason: 'lock_failed' 
      })
    }

    if (!lock || lock.length === 0) {
      return NextResponse.json({ 
        locked: false, 
        reason: 'click_invalid_or_used' 
      })
    }

    // 设置 HttpOnly Cookie
    const response = NextResponse.json({ 
      locked: true, 
      lock_id: lock[0].id 
    })
    
    response.cookies.set('checkout_lock_id', lock[0].id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: LOCK_EXPIRY_MINUTES * 60,
      path: '/'
    })

    return response
  } catch (error) {
    console.error('[affiliate/checkout-lock] Error:', error)
    return NextResponse.json({ 
      locked: false, 
      reason: 'internal_error' 
    })
  }
}
