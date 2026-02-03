/**
 * POST /api/messages — Send a chat message
 * Validates conversation participation, inserts message, updates last_message_at,
 * inserts notification(s) for receiver(s), and logs audit.
 * Rate limit: 30 messages/minute per user (anti-spam).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'

const MAX_MESSAGE_LENGTH = 10000
const ALLOWED_MESSAGE_TYPES = ['text', 'image', 'product', 'post', 'system'] as const

/** Sanitize message content: trim and limit length. Frontend must render as plain text (no HTML) to avoid XSS. */
function sanitizeContent(content: string): string {
  return (content ?? '').trim().slice(0, MAX_MESSAGE_LENGTH)
}

function isValidImageContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  try {
    const u = new URL(trimmed)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function isValidProductOrPostContent(content: string, type: 'product' | 'post'): boolean {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object') return false
    const o = parsed as Record<string, unknown>
    return (
      o.type === type &&
      typeof o.id === 'string' &&
      typeof o.url === 'string'
    )
  } catch {
    return false
  }
}

async function messagesPostHandler(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const conversationId = body?.conversation_id as string | undefined
    const rawContent = body?.content as string | undefined
    const messageTypeRaw = (body?.message_type as string) || 'text'
    const messageType = ALLOWED_MESSAGE_TYPES.includes(messageTypeRaw as any)
      ? messageTypeRaw
      : 'text'

    if (!conversationId || typeof rawContent !== 'string') {
      return NextResponse.json(
        { error: 'conversation_id and content are required' },
        { status: 400 }
      )
    }

    const content = messageType === 'text'
      ? sanitizeContent(rawContent)
      : rawContent.trim().slice(0, MAX_MESSAGE_LENGTH)
    if (!content) {
      return NextResponse.json(
        { error: 'content is required and must be non-empty after sanitization' },
        { status: 400 }
      )
    }

    if (messageType === 'image' && !isValidImageContent(content)) {
      return NextResponse.json(
        { error: 'Invalid image content: must be a valid HTTP(S) URL' },
        { status: 400 }
      )
    }
    if (messageType === 'product' && !isValidProductOrPostContent(content, 'product')) {
      return NextResponse.json(
        { error: 'Invalid product card: content must be JSON with type, id, url' },
        { status: 400 }
      )
    }
    if (messageType === 'post' && !isValidProductOrPostContent(content, 'post')) {
      return NextResponse.json(
        { error: 'Invalid post card: content must be JSON with type, id, url' },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()

    // Load conversation and verify user is participant or group member
    const { data: conversation, error: convError } = await admin
      .from('conversations')
      .select('id, conversation_type, participant1_id, participant2_id')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    const isPrivate = conversation.conversation_type === 'private'
    const isParticipant =
      conversation.participant1_id === user.id || conversation.participant2_id === user.id

    let isMember = isParticipant
    if (!isParticipant && conversation.conversation_type === 'group') {
      const { data: member } = await admin
        .from('group_members')
        .select('user_id')
        .eq('group_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
      isMember = !!member
    }

    if (!isMember) {
      return NextResponse.json(
        { error: 'You are not a participant in this conversation' },
        { status: 403 }
      )
    }

    // Sender must not be banned/suspended
    const { data: senderProfileRow } = await admin
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .single()
    if (senderProfileRow?.status === 'banned' || senderProfileRow?.status === 'suspended') {
      return NextResponse.json(
        { error: 'Your account cannot send messages' },
        { status: 403 }
      )
    }

    // Private chat: other must not be banned/suspended, and must not have blocked current user
    if (isPrivate) {
      const otherId =
        conversation.participant1_id === user.id
          ? conversation.participant2_id
          : conversation.participant1_id
      if (otherId) {
        const { data: otherProfile } = await admin
          .from('profiles')
          .select('status')
          .eq('id', otherId)
          .single()
        if (otherProfile?.status === 'banned' || otherProfile?.status === 'suspended') {
          return NextResponse.json(
            { error: 'Cannot send message to this user' },
            { status: 403 }
          )
        }
        const { data: blockedByOther } = await admin
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', otherId)
          .eq('blocked_id', user.id)
          .limit(1)
          .maybeSingle()
        if (blockedByOther) {
          return NextResponse.json(
            { error: 'You have been blocked by this user' },
            { status: 403 }
          )
        }
        // Current user has blocked the other: disallow sending so block is effective
        const { data: iBlockedOther } = await admin
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', user.id)
          .eq('blocked_id', otherId)
          .limit(1)
          .maybeSingle()
        if (iBlockedOther) {
          return NextResponse.json(
            { error: 'You have blocked this user' },
            { status: 403 }
          )
        }
      }
    }

    // Insert message
    const { data: message, error: insertError } = await admin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: messageType,
      })
      .select('id, created_at')
      .single()

    if (insertError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[api/messages] Insert error:', insertError)
      }
      return NextResponse.json(
        { error: insertError.message || 'Failed to send message' },
        { status: 500 }
      )
    }

    // Update conversation last_message_at and last_message_id
    await admin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_id: message.id,
      })
      .eq('id', conversationId)

    // Resolve receiver(s) and insert notifications
    const receiverIds: string[] = []
    if (isPrivate) {
      const other =
        conversation.participant1_id === user.id
          ? conversation.participant2_id
          : conversation.participant1_id
      if (other) receiverIds.push(other)
    } else {
      const { data: members } = await admin
        .from('group_members')
        .select('user_id')
        .eq('group_id', conversationId)
        .neq('user_id', user.id)
      receiverIds.push(...(members?.map((m) => m.user_id) ?? []))
    }

    const contentKey = isPrivate ? 'new_chat_message' : 'new_group_message'
    const link = `/messages/${conversationId}`

    // Sender display name for notification
    const { data: senderProfile } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single()
    const senderName =
      senderProfile?.display_name || senderProfile?.username || 'Someone'

    const isText = messageType === 'text'
    const previewContent = isText
      ? `${senderName}: ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`
      : `${senderName} sent you a message`

    for (const receiverId of receiverIds) {
      try {
        await admin.from('notifications').insert({
          user_id: receiverId,
          type: 'message',
          title: isPrivate ? 'New message' : 'New group message',
          content: previewContent,
          related_id: conversationId,
          related_type: 'conversation',
          link,
          actor_id: user.id,
          content_key: contentKey,
          content_params: { senderName },
        })
      } catch (notifErr) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[api/messages] Notification insert failed:', notifErr)
        }
      }
    }

    logAudit({
      action: isPrivate ? 'send_message' : 'send_group_message',
      userId: user.id,
      resourceId: conversationId,
      resourceType: 'conversation',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { conversation_type: conversation.conversation_type, message_id: message.id },
    })

    return NextResponse.json({
      success: true,
      id: message.id,
      created_at: message.created_at,
    })
  } catch (err: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[api/messages] Error:', err)
    }
    const message = err instanceof Error ? err.message : 'Failed to send message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withApiLogging(messagesPostHandler, {
  rateLimitConfig: RateLimitConfigs.MESSAGES,
})
