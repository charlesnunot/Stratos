/**
 * User support ticket update API
 * PUT: Update own ticket (title, description, or reopen)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { sanitizeContent } from '@/lib/utils/sanitize-content'

const TITLE_MAX_LENGTH = 200
const DESCRIPTION_MAX_LENGTH = 5000

export async function PUT(
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

    let body: { title?: string; description?: string; status?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()

    const { data: ticket, error: ticketError } = await admin
      .from('support_tickets')
      .select('id, user_id, status')
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof body.title === 'string') {
      const raw = body.title.trim()
      if (!raw) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
      }
      if (raw.length > TITLE_MAX_LENGTH) {
        return NextResponse.json(
          { error: `Title must be at most ${TITLE_MAX_LENGTH} characters` },
          { status: 400 }
        )
      }
      updates.title = sanitizeContent(raw)
    }

    if (typeof body.description === 'string') {
      const raw = body.description.trim()
      if (!raw) {
        return NextResponse.json({ error: 'Description cannot be empty' }, { status: 400 })
      }
      if (raw.length > DESCRIPTION_MAX_LENGTH) {
        return NextResponse.json(
          { error: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters` },
          { status: 400 }
        )
      }
      updates.description = sanitizeContent(raw)
    }

    if (body.status === 'open' && ticket.status === 'closed') {
      updates.status = 'open'
    } else if (body.status && body.status !== ticket.status && body.status !== 'open') {
      return NextResponse.json(
        { error: 'Users can only reopen closed tickets' },
        { status: 400 }
      )
    }

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ ok: true })
    }

    const { error: updateError } = await admin
      .from('support_tickets')
      .update(updates)
      .eq('id', ticketId)
      .eq('user_id', user.id)

    if (updateError) {
      logAudit({
        action: 'update_ticket',
        userId: user.id,
        resourceId: ticketId,
        resourceType: 'support_ticket',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    logAudit({
      action: 'update_ticket',
      userId: user.id,
      resourceId: ticketId,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
    })

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[support/tickets/[id] PUT]', error)
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
