/**
 * Feed 推荐反馈：用户对 Feed 条目的「有帮助/不相关/隐藏」反馈。
 * 与 trust_judgment_feedback 同构，便于后续排序与策略迭代。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_REASON_TYPES = [
  'followed_user',
  'followed_topic',
  'trending',
  'story_topic',
  'music_artist',
  'short_video_trending',
] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const postId = typeof body?.postId === 'string' ? body.postId.trim() : null
    const reasonType =
      typeof body?.reasonType === 'string' && VALID_REASON_TYPES.includes(body.reasonType as (typeof VALID_REASON_TYPES)[number])
        ? body.reasonType
        : null
    const agreed = typeof body?.agreed === 'boolean' ? body.agreed : null
    const dismissed = body?.dismissed === true

    if (!postId) {
      return NextResponse.json({ error: 'missing postId' }, { status: 400 })
    }

    const row = {
      user_id: user.id,
      post_id: postId,
      reason_type: reasonType ?? null,
      agreed: agreed ?? null,
      dismissed,
    }

    const { error } = await supabase
      .from('feed_recommendation_feedback')
      .upsert(row, {
        onConflict: 'user_id,post_id',
        ignoreDuplicates: false,
      })

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[feed/feedback]', error)
      }
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[feed/feedback]', err)
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
