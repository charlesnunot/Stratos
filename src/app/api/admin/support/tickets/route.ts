/**
 * Admin support tickets API
 * Allows admins/support to list all tickets
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'

export async function GET(request: NextRequest) {
  try {
    // Require admin or support role
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { supabase } = authResult.data

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignedTo = searchParams.get('assignedTo')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        user:profiles!support_tickets_user_id_fkey(id, username, display_name, avatar_url),
        assigned_user:profiles!support_tickets_assigned_to_fkey(id, username, display_name, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (assignedTo === 'unassigned') {
      query = query.is('assigned_to', null)
    } else if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    const { data: tickets, error: ticketsError } = await query

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError)
      return NextResponse.json(
        { error: 'Failed to fetch tickets' },
        { status: 500 }
      )
    }

    // Get counts for dashboard
    const { data: countData } = await supabase
      .from('support_tickets')
      .select('status', { count: 'exact', head: false })

    const counts = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    }

    if (countData) {
      for (const ticket of countData) {
        if (ticket.status in counts) {
          counts[ticket.status as keyof typeof counts]++
        }
      }
    }

    return NextResponse.json({
      tickets: tickets || [],
      counts,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Get tickets error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to get tickets'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
