/**
 * Cron job: Automatically close tickets that have been inactive for a long time
 * Default: Close tickets with status 'resolved' after 7 days of inactivity
 * Or tickets with status 'in_progress' after 30 days of inactivity
 * 
 * Should be called daily (e.g., via Vercel Cron at 0 7 * * *)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export const dynamic = 'force-dynamic'

// Configuration: days of inactivity before auto-close
const RESOLVED_INACTIVE_DAYS = 7
const IN_PROGRESS_INACTIVE_DAYS = 30

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const { verifyCronSecret } = await import('@/lib/cron/verify-cron-secret')
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth

    const supabaseAdmin = await getSupabaseAdmin()

    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting ticket auto-close at', new Date().toISOString())
    }

    const now = new Date()
    const resolvedCutoff = new Date(now.getTime() - RESOLVED_INACTIVE_DAYS * 24 * 60 * 60 * 1000)
    const inProgressCutoff = new Date(now.getTime() - IN_PROGRESS_INACTIVE_DAYS * 24 * 60 * 60 * 1000)

    // Find resolved tickets that are inactive
    const { data: resolvedTickets, error: resolvedError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, title, status')
      .eq('status', 'resolved')
      .lt('updated_at', resolvedCutoff.toISOString())

    if (resolvedError) {
      throw new Error(`Failed to fetch resolved tickets: ${resolvedError.message}`)
    }

    // Find in_progress tickets that are inactive (no response for a long time)
    const { data: inProgressTickets, error: inProgressError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, title, status')
      .eq('status', 'in_progress')
      .lt('updated_at', inProgressCutoff.toISOString())

    if (inProgressError) {
      throw new Error(`Failed to fetch in_progress tickets: ${inProgressError.message}`)
    }

    const ticketsToClose = [
      ...(resolvedTickets || []),
      ...(inProgressTickets || []),
    ]

    let closedCount = 0
    const closedTicketIds: string[] = []

    for (const ticket of ticketsToClose) {
      // Close the ticket
      const { error: updateError } = await supabaseAdmin
        .from('support_tickets')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticket.id)

      if (updateError) {
        console.error(`[Cron] Failed to close ticket ${ticket.id}:`, updateError)
        continue
      }

      // Notify the user that their ticket was auto-closed
      await supabaseAdmin.from('notifications').insert({
        user_id: ticket.user_id,
        type: 'system',
        title: 'Ticket Auto-Closed',
        content: `Your ticket "${ticket.title}" has been automatically closed due to inactivity.`,
        related_id: ticket.id,
        related_type: 'support_ticket',
        link: `/support/tickets/${ticket.id}`,
        content_key: 'ticket_auto_closed',
        content_params: {
          ticketTitle: ticket.title,
        },
      })

      closedCount++
      closedTicketIds.push(ticket.id)
    }

    const duration = Date.now() - startTime
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Ticket auto-close completed in', duration, 'ms, closed:', closedCount)
    }

    // Log to cron_logs
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'auto_close_tickets',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          closed_count: closedCount,
          resolved_inactive_days: RESOLVED_INACTIVE_DAYS,
          in_progress_inactive_days: IN_PROGRESS_INACTIVE_DAYS,
        },
      })
    } catch (_) {}

    // Audit log (always log success for consistency with other crons)
    logAudit({
      action: 'cron_auto_close_tickets',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        closed_count: closedCount,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Ticket auto-close completed',
      executionTime: duration,
      closedCount,
      closedTicketIds,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Cron job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to auto-close tickets'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'auto_close_tickets',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_auto_close_tickets',
      resourceType: 'cron',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { error: message },
    })
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
