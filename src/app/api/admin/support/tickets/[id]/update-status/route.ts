/**
 * Admin ticket update-status API
 * POST: Update ticket status (in_progress, resolved, closed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

const VALID_STATUSES = ['in_progress', 'resolved', 'closed'] as const

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
    let body: { status?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const status = body?.status
    if (!status || !VALID_STATUSES.includes(status as any)) {
      return NextResponse.json(
        { error: 'Missing or invalid status. Must be in_progress, resolved, or closed' },
        { status: 400 }
      )
    }

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })
    }

    const supabaseAdmin = await getSupabaseAdmin()

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, title, status')
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.status === 'closed') {
      return NextResponse.json(
        { error: 'Ticket is already closed' },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabaseAdmin
      .from('support_tickets')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)

    if (updateError) {
      console.error('Error updating ticket status:', updateError)
      logAudit({
        action: 'ticket_update_status',
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
      action: 'ticket_update_status',
      userId: user.id,
      resourceId: ticketId,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { previousStatus: ticket.status, newStatus: status },
    })

    return NextResponse.json({ ok: true, status })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Update ticket status error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to update ticket status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
