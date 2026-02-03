/**
 * Admin ticket escalate API
 * Allows support staff to escalate tickets to higher priority or to admins
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent']

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
    const { user, profile } = authResult.data
    let body: { priority?: string; reason?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { priority, reason } = body

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
      .select('id, user_id, title, status, priority')
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
        { error: 'Cannot escalate a closed ticket' },
        { status: 400 }
      )
    }

    // Determine new priority (default: upgrade by one level)
    let newPriority = priority
    if (!newPriority || !VALID_PRIORITIES.includes(newPriority)) {
      const currentIndex = VALID_PRIORITIES.indexOf(ticket.priority)
      if (currentIndex < VALID_PRIORITIES.length - 1) {
        newPriority = VALID_PRIORITIES[currentIndex + 1]
      } else {
        newPriority = 'urgent'
      }
    }

    // Update ticket priority
    const { error: updateError } = await supabaseAdmin
      .from('support_tickets')
      .update({
        priority: newPriority,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)

    if (updateError) {
      console.error('Error escalating ticket:', updateError)
      logAudit({
        action: 'ticket_escalate',
        userId: user.id,
        resourceId: ticketId,
        resourceType: 'support_ticket',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: 'Failed to escalate ticket' },
        { status: 500 }
      )
    }

    // Notify all admins about escalation (use content_key for i18n)
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin) => ({
        user_id: admin.id,
        type: 'system',
        title: 'Ticket Escalated',
        content: `A support ticket has been escalated to ${newPriority} priority: ${ticket.title}`,
        related_id: ticketId,
        related_type: 'support_ticket',
        link: '/admin/support',
        actor_id: user.id,
        content_key: 'ticket_escalated',
        content_params: {
          ticketTitle: ticket.title,
          newPriority,
          previousPriority: ticket.priority,
        },
      }))

      await supabaseAdmin.from('notifications').insert(notifications)
    }

    // If escalated by support staff, add a reply noting the escalation
    if (profile.role === 'support') {
      await supabaseAdmin.from('support_ticket_replies').insert({
        ticket_id: ticketId,
        user_id: user.id,
        content: `[System] Ticket escalated from ${ticket.priority} to ${newPriority}${reason ? `: ${reason}` : ''}`,
      })
    }

    // Audit log - do not include reason content to avoid sensitive data
    logAudit({
      action: 'ticket_escalate',
      userId: user.id,
      resourceId: ticketId,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        previousPriority: ticket.priority,
        newPriority,
        escalatedBy: profile.role,
      },
    })

    return NextResponse.json({ success: true, newPriority })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Escalate ticket error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to escalate ticket'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
