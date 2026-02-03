/**
 * Admin ticket respond API
 * Allows admins/support to reply to tickets
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { sanitizeContent } from '@/lib/utils/sanitize-content'

const REPLY_MAX_LENGTH = 5000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { id: ticketId } = await params
    const { user } = authResult.data
    let body: { content?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { content } = body

    if (!ticketId) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      )
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Reply content is required' },
        { status: 400 }
      )
    }

    const trimmedContent = content.trim()
    if (!trimmedContent) {
      return NextResponse.json(
        { error: 'Reply content cannot be empty' },
        { status: 400 }
      )
    }

    if (trimmedContent.length > REPLY_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Reply content must be at most ${REPLY_MAX_LENGTH} characters` },
        { status: 400 }
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()

    // Verify ticket exists and is not closed
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, title, status')
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    if (ticket.status === 'closed') {
      return NextResponse.json(
        { error: 'Cannot reply to a closed ticket' },
        { status: 400 }
      )
    }

    // Sanitize content
    const safeContent = sanitizeContent(trimmedContent)

    // Insert reply (trigger will handle notification automatically)
    const { error: replyError } = await supabaseAdmin
      .from('support_ticket_replies')
      .insert({
        ticket_id: ticketId,
        user_id: user.id,
        content: safeContent,
      })

    if (replyError) {
      console.error('Error inserting reply:', replyError)
      logAudit({
        action: 'ticket_respond',
        userId: user.id,
        resourceId: ticketId,
        resourceType: 'support_ticket',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: replyError.message },
      })
      return NextResponse.json(
        { error: 'Failed to add reply' },
        { status: 500 }
      )
    }

    // Update ticket updated_at and status if needed
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (ticket.status === 'open') {
      updateData.status = 'in_progress'
    }

    await supabaseAdmin
      .from('support_tickets')
      .update(updateData)
      .eq('id', ticketId)

    // Audit log - do not include reply content to avoid sensitive data
    logAudit({
      action: 'ticket_respond',
      userId: user.id,
      resourceId: ticketId,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        previousStatus: ticket.status,
        newStatus: updateData.status || ticket.status,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Respond to ticket error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to respond to ticket'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
