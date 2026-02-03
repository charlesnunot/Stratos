/**
 * Admin ticket close API
 * Allows admins/support to close tickets
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

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
    const { resolution } = await request.json().catch(() => ({}))

    if (!ticketId) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()

    // Verify ticket exists
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
        { error: 'Ticket is already closed' },
        { status: 400 }
      )
    }

    // Update ticket status to closed
    const { error: updateError } = await supabaseAdmin
      .from('support_tickets')
      .update({
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)

    if (updateError) {
      console.error('Error closing ticket:', updateError)
      logAudit({
        action: 'ticket_close',
        userId: user.id,
        resourceId: ticketId,
        resourceType: 'support_ticket',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: 'Failed to close ticket' },
        { status: 500 }
      )
    }

    // Notification is handled by trigger (create_ticket_status_change_notification)

    // Audit log - do not include description/resolution content
    logAudit({
      action: 'ticket_close',
      userId: user.id,
      resourceId: ticketId,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        previousStatus: ticket.status,
        hasResolution: !!resolution,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Close ticket error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to close ticket'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
