/**
 * GET /api/settings — 获取当前用户的隐私与通知设置
 * PATCH /api/settings — 更新当前用户的隐私与通知设置
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'

type ProfileVisibility = 'public' | 'private' | 'followers'
type WhoCan = 'everyone' | 'followers' | 'nobody'

const DEFAULT_SETTINGS: {
  profile_visibility: ProfileVisibility
  who_can_message: WhoCan
  who_can_comment: WhoCan
  email_messages: boolean
  email_likes: boolean
  email_comments: boolean
  email_follows: boolean
  email_orders: boolean
  email_marketing: boolean
} = {
  profile_visibility: 'public',
  who_can_message: 'everyone',
  who_can_comment: 'everyone',
  email_messages: true,
  email_likes: true,
  email_comments: true,
  email_follows: true,
  email_orders: true,
  email_marketing: false,
}

export type UserSettings = typeof DEFAULT_SETTINGS

function validProfileVisibility(v: unknown): v is 'public' | 'followers' | 'private' {
  return v === 'public' || v === 'followers' || v === 'private'
}
function validWho(v: unknown): v is 'everyone' | 'followers' | 'nobody' {
  return v === 'everyone' || v === 'followers' || v === 'nobody'
}

async function getHandler() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: row } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const settings: UserSettings = row
    ? {
        profile_visibility: row.profile_visibility ?? DEFAULT_SETTINGS.profile_visibility,
        who_can_message: row.who_can_message ?? DEFAULT_SETTINGS.who_can_message,
        who_can_comment: row.who_can_comment ?? DEFAULT_SETTINGS.who_can_comment,
        email_messages: row.email_messages ?? DEFAULT_SETTINGS.email_messages,
        email_likes: row.email_likes ?? DEFAULT_SETTINGS.email_likes,
        email_comments: row.email_comments ?? DEFAULT_SETTINGS.email_comments,
        email_follows: row.email_follows ?? DEFAULT_SETTINGS.email_follows,
        email_orders: row.email_orders ?? DEFAULT_SETTINGS.email_orders,
        email_marketing: row.email_marketing ?? DEFAULT_SETTINGS.email_marketing,
      }
    : { ...DEFAULT_SETTINGS }

  return NextResponse.json(settings)
}

async function patchHandler(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Partial<UserSettings> = {}

  if (body.profile_visibility !== undefined) {
    if (!validProfileVisibility(body.profile_visibility)) {
      return NextResponse.json(
        { error: 'profile_visibility must be public, followers, or private' },
        { status: 400 }
      )
    }
    updates.profile_visibility = body.profile_visibility
  }
  if (body.who_can_message !== undefined) {
    if (!validWho(body.who_can_message)) {
      return NextResponse.json(
        { error: 'who_can_message must be everyone, followers, or nobody' },
        { status: 400 }
      )
    }
    updates.who_can_message = body.who_can_message
  }
  if (body.who_can_comment !== undefined) {
    if (!validWho(body.who_can_comment)) {
      return NextResponse.json(
        { error: 'who_can_comment must be everyone, followers, or nobody' },
        { status: 400 }
      )
    }
    updates.who_can_comment = body.who_can_comment
  }

  const boolKeys = [
    'email_messages',
    'email_likes',
    'email_comments',
    'email_follows',
    'email_orders',
    'email_marketing',
  ] as const
  for (const key of boolKeys) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') {
        return NextResponse.json({ error: `${key} must be boolean` }, { status: 400 })
      }
      updates[key] = body[key] as boolean
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    const { error: updateError } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to update settings' },
        { status: 500 }
      )
    }
  } else {
    const { error: insertError } = await supabase.from('user_settings').insert({
      user_id: user.id,
      ...DEFAULT_SETTINGS,
      ...updates,
    })

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || 'Failed to save settings' },
        { status: 500 }
      )
    }
  }

  const { data: row } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const settings: UserSettings = row
    ? {
        profile_visibility: row.profile_visibility ?? DEFAULT_SETTINGS.profile_visibility,
        who_can_message: row.who_can_message ?? DEFAULT_SETTINGS.who_can_message,
        who_can_comment: row.who_can_comment ?? DEFAULT_SETTINGS.who_can_comment,
        email_messages: row.email_messages ?? DEFAULT_SETTINGS.email_messages,
        email_likes: row.email_likes ?? DEFAULT_SETTINGS.email_likes,
        email_comments: row.email_comments ?? DEFAULT_SETTINGS.email_comments,
        email_follows: row.email_follows ?? DEFAULT_SETTINGS.email_follows,
        email_orders: row.email_orders ?? DEFAULT_SETTINGS.email_orders,
        email_marketing: row.email_marketing ?? DEFAULT_SETTINGS.email_marketing,
      }
    : { ...DEFAULT_SETTINGS, ...updates }

  return NextResponse.json(settings)
}

export const GET = withApiLogging(getHandler, {
  rateLimitConfig: RateLimitConfigs.DEFAULT,
})
export const PATCH = withApiLogging(patchHandler, {
  rateLimitConfig: RateLimitConfigs.DEFAULT,
})
