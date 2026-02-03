/**
 * User support ticket replies API
 * POST: Add reply (auth required, ownership enforced, logAudit)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { sanitizeContent } from '@/lib/utils/sanitize-content'

const REPLY_MAX_LENGTH = 5000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ticketId } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })
    }

    let body: { content?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const rawContent = typeof body.content === 'string' ? body.content.trim() : ''
    if (!rawContent) {
      return NextResponse.json({ error: 'Reply content is required' }, { status: 400 })
    }
    if (rawContent.length > REPLY_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Reply must be at most ${REPLY_MAX_LENGTH} characters` },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()

    const { data: ticket, error: ticketError } = await admin
      .from('support_tickets')
      .select('id, user_id, assigned_to, status')
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const isOwner = ticket.user_id === user.id
    const isAssigned = ticket.assigned_to === user.id
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdminOrSupport = profile?.role === 'admin' || profile?.role === 'support'

    if (!isOwner && !isAssigned && !isAdminOrSupport) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (ticket.status === 'closed') {
      return NextResponse.json(
        { error: 'Cannot reply to a closed ticket' },
        { status: 400 }
      )
    }

    const content = sanitizeContent(rawContent)

    const { error: insertError } = await admin.from('support_ticket_replies').insert({
      ticket_id: ticketId,
      user_id: user.id,
      content,
    })

    if (insertError) {
      logAudit({
        action: 'reply_support_ticket',
        userId: user.id,
        resourceId: ticketId,
        resourceType: 'support_ticket',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: insertError.message },
      })
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    await admin
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId)

    logAudit({
      action: 'reply_support_ticket',
      userId: user.id,
      resourceId: ticketId,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[support/tickets/[id]/replies POST]', error)
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
