import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'

const TRACK_SESSION_COOKIE = 'track_sid'
const SESSION_MAX_AGE = 365 * 24 * 60 * 60 // 1 year

type EntityType = 'post' | 'product' | 'profile'

function isValidUuid(s: string): boolean {
  const u =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return u.test(s)
}

/**
 * 浏览统计 API
 * 
 * 链路追踪：
 * - 入口：useTrackView hook 在页面挂载时调用
 * - 处理：记录到 view_events 表
 * - 日志：记录浏览事件，不记录敏感信息（邮箱、原文等）
 * 
 * 隐私保护：
 * - 使用 session cookie 跟踪匿名用户（不记录IP）
 * - 只记录 entity_type, entity_id, viewer_id, session_id
 * - 不记录 entity 内容原文
 */
async function trackViewHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const entityType = body?.entityType as EntityType | undefined
    const entityId = body?.entityId as string | undefined

    if (
      !entityType ||
      !entityId ||
      !['post', 'product', 'profile'].includes(entityType) ||
      !isValidUuid(entityId)
    ) {
      return NextResponse.json(
        { error: 'Invalid entityType or entityId' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    let ownerId: string | null = null

    // 验证实体存在且可见（不查询敏感字段）
    if (entityType === 'post') {
      const { data } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', entityId)
        .eq('status', 'approved')
        .single()
      ownerId = data?.user_id ?? null
    } else if (entityType === 'product') {
      const { data } = await supabase
        .from('products')
        .select('seller_id')
        .eq('id', entityId)
        .eq('status', 'active')
        .single()
      ownerId = data?.seller_id ?? null
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', entityId)
        .single()
      ownerId = data?.id ?? null
    }

    if (!ownerId) {
      return NextResponse.json(
        { error: 'Entity not found or not viewable' },
        { status: 404 }
      )
    }

    const { data: { user } } = await supabase.auth.getUser()
    const cookieStore = await cookies()
    let sessionId = cookieStore.get(TRACK_SESSION_COOKIE)?.value
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      cookieStore.set(TRACK_SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })
    }

    const viewedAt = new Date().toISOString()
    
    const { error } = await supabase.from('view_events').insert({
      entity_type: entityType,
      entity_id: entityId,
      viewer_id: user?.id ?? null,
      session_id: sessionId,
      viewed_at: viewedAt,
      owner_id: ownerId,
    })

    if (error) {
      console.error('[track/view] insert error:', error)
      return NextResponse.json({ error: 'Failed to record view' }, { status: 500 })
    }

    // 日志记录（不含敏感信息）
    console.log('[track/view] success', {
      entityType,
      entityId: `${entityId.substring(0, 8)}...`,
      viewerId: user?.id ? `${user.id.substring(0, 8)}...` : 'anonymous',
      ownerId: `${ownerId.substring(0, 8)}...`,
      timestamp: viewedAt,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    console.error('[track/view] exception:', e?.message || e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/** 浏览埋点：限流 120 次/分钟/IP 或用户，防刷量 */
export const POST = withApiLogging(trackViewHandler, {
  rateLimitConfig: RateLimitConfigs.TRACK_VIEW,
})
