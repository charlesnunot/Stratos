/**
 * Admin ticket assignment API
 * Allows admins to assign tickets to support staff
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
    let body: { assignedTo?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const rawAssignedTo = body.assignedTo
    const assignedTo =
      rawAssignedTo && rawAssignedTo !== 'unassigned' ? rawAssignedTo : null

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

    // Verify assignee is admin or support (if assigning)
    if (assignedTo) {
      const { data: assigneeProfile, error: assigneeError } = await supabaseAdmin
        .from('profiles')
        .select('id, role, display_name, username')
        .eq('id', assignedTo)
        .single()

      if (assigneeError || !assigneeProfile) {
        return NextResponse.json(
          { error: 'Assignee not found' },
          { status: 404 }
        )
      }

      if (assigneeProfile.role !== 'admin' && assigneeProfile.role !== 'support') {
        return NextResponse.json(
          { error: 'Assignee must be admin or support staff' },
          { status: 400 }
        )
      }
    }

    // Update ticket assignment
    const updateData: Record<string, unknown> = {
      assigned_to: assignedTo,
      updated_at: new Date().toISOString(),
    }

    // Auto-set status to in_progress when assigned
    if (assignedTo && ticket.status === 'open') {
      updateData.status = 'in_progress'
    }

    const { error: updateError } = await supabaseAdmin
      .from('support_tickets')
      .update(updateData)
      .eq('id', ticketId)

    if (updateError) {
      console.error('Error updating ticket assignment:', updateError)
      logAudit({
        action: 'ticket_assign',
        userId: user.id,
        resourceId: ticketId,
        resourceType: 'support_ticket',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: 'Failed to assign ticket' },
        { status: 500 }
      )
    }

    // Notify the assigned staff member (use content_key for i18n)
    if (assignedTo) {
      await supabaseAdmin.from('notifications').insert({
        user_id: assignedTo,
        type: 'system',
        title: 'Ticket Assigned to You',
        content: `A support ticket has been assigned to you: ${ticket.title}`,
        related_id: ticketId,
        related_type: 'support_ticket',
        link: '/admin/support',
        actor_id: user.id,
        content_key: 'ticket_assigned',
        content_params: {
          ticketTitle: ticket.title,
        },
      })
    }

    // Audit log - do not include description/content
    logAudit({
      action: 'ticket_assign',
      userId: user.id,
      resourceId: ticketId,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        assignedTo,
        previousStatus: ticket.status,
        newStatus: updateData.status || ticket.status,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Assign ticket error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to assign ticket'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
