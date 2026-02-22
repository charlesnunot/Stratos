import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const CLICK_EXPIRY_DAYS = 7

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

function hashIP(ip: string): string {
  if (!ip || ip === 'unknown') return ''
  return createHash('sha256')
    .update(ip + process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 16))
    .digest('hex')
    .substring(0, 32)
}

function hashUA(ua: string | null): string {
  if (!ua) return ''
  return createHash('sha256')
    .update(ua)
    .digest('hex')
    .substring(0, 32)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { affiliate_post_id } = body

    if (!affiliate_post_id) {
      return NextResponse.json(
        { error: 'Missing affiliate_post_id' },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()

    // 服务端查询 affiliate_post，获取 affiliate_id 和 product_id
    const { data: affiliatePost, error: postError } = await admin
      .from('affiliate_posts')
      .select('id, affiliate_id, product_id')
      .eq('id', affiliate_post_id)
      .single()

    if (postError || !affiliatePost) {
      return NextResponse.json(
        { error: 'Invalid affiliate_post_id' },
        { status: 400 }
      )
    }

    // 生成访客标识
    const visitorId = generateVisitorId(request)

    // 计算过期时间
    const expiresAt = new Date(Date.now() + CLICK_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // 插入 click
    const { data: click, error: clickError } = await admin
      .from('affiliate_clicks')
      .insert({
        affiliate_post_id,
        product_id: affiliatePost.product_id,
        affiliate_id: affiliatePost.affiliate_id,
        visitor_id: visitorId,
        ip_hash: hashIP(getClientIP(request)),
        user_agent_hash: hashUA(request.headers.get('user-agent')),
        expires_at: expiresAt.toISOString()
      })
      .select('id')
      .single()

    if (clickError) {
      console.error('[affiliate/clicks] Error creating click:', clickError)
      return NextResponse.json(
        { error: 'Failed to create click' },
        { status: 500 }
      )
    }

    // 设置 HttpOnly Cookie
    const response = NextResponse.json({ click_id: click.id })
    
    response.cookies.set('affiliate_click_id', click.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: CLICK_EXPIRY_DAYS * 24 * 60 * 60,
      path: '/'
    })
    
    response.cookies.set('affiliate_visitor_id', visitorId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: CLICK_EXPIRY_DAYS * 24 * 60 * 60,
      path: '/'
    })

    return response
  } catch (error) {
    console.error('[affiliate/clicks] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
