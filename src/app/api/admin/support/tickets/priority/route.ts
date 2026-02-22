/**
 * Admin API: Get support tickets by priority
 * GET: List tickets filtered by priority level with SLA info
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }

    const supabase = await createClient()

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const priority = searchParams.get('priority') // 'standard', 'priority', 'vip', or null for all
    const status = searchParams.get('status') || 'open'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        user:profiles!support_tickets_user_id_fkey(id, username, display_name, avatar_url, subscription_tier),
        assigned_to_profile:profiles!support_tickets_assigned_to_fkey(id, username, display_name)
      `)
      .eq('status', status)
      .order('priority_level', { ascending: false }) // VIP first, then priority, then standard
      .order('response_deadline', { ascending: true }) // Earliest deadline first
      .range(offset, offset + limit - 1)

    if (priority) {
      query = query.eq('priority_level', priority)
    }

    const { data: tickets, error: ticketsError } = await query

    if (ticketsError) {
      console.error('[admin/support/tickets/priority] Query error:', ticketsError)
      return NextResponse.json(
        { error: 'Failed to fetch tickets', details: ticketsError.message },
        { status: 500 }
      )
    }

    // Get priority counts
    const { data: counts, error: countsError } = await supabase
      .rpc('get_priority_counts', { p_status: status })

    if (countsError) {
      console.error('[admin/support/tickets/priority] Counts error:', countsError)
    }

    // Calculate time remaining for each ticket
    const ticketsWithTimeRemaining = (tickets || []).map((ticket: any) => {
      const now = new Date()
      const deadline = ticket.response_deadline ? new Date(ticket.response_deadline) : null
      const timeRemaining = deadline ? deadline.getTime() - now.getTime() : null
      
      return {
        ...ticket,
        time_remaining_ms: timeRemaining,
        time_remaining_hours: timeRemaining ? Math.ceil(timeRemaining / (1000 * 60 * 60)) : null,
        is_urgent: timeRemaining !== null && timeRemaining < 1000 * 60 * 60, // Less than 1 hour
      }
    })

    return NextResponse.json({
      tickets: ticketsWithTimeRemaining,
      counts: counts || [],
      pagination: {
        limit,
        offset,
        total: tickets?.length || 0,
      },
    })
  } catch (error: unknown) {
    console.error('[admin/support/tickets/priority] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
