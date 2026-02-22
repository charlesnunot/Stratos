/**
 * Compensation management API
 * Allows admins to view and process compensation transfers
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { detectCompensationNeeded, processCompensation } from '@/lib/payments/compensation'
import { logAudit } from '@/lib/api/audit'

export async function GET(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Get compensation records
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('payment_compensations')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: compensations, error } = await query

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch compensations: ${error.message}` },
        { status: 500 }
      )
    }

    // Also detect new compensations needed
    const needed = await detectCompensationNeeded(supabaseAdmin, 10)

    return NextResponse.json({
      compensations: compensations || [],
      needed: needed.length,
    })
  } catch (error: any) {
    console.error('Get compensations error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get compensations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    const adminUserId = authResult.data.user.id
    const supabaseAdmin = await getSupabaseAdmin()

    const body = await request.json()
    const { action, compensationId } = body

    if (action === 'process' && compensationId) {
      const result = await processCompensation(compensationId, supabaseAdmin)

      if (!result.success) {
        logAudit({
          action: 'compensation',
          userId: adminUserId,
          resourceId: compensationId,
          resourceType: 'payment_compensation',
          result: 'fail',
          timestamp: new Date().toISOString(),
          meta: { reason: result.error },
        })
        return NextResponse.json(
          { error: result.error || 'Failed to process compensation' },
          { status: 500 }
        )
      }
      logAudit({
        action: 'compensation',
        userId: adminUserId,
        resourceId: compensationId,
        resourceType: 'payment_compensation',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Process compensation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process compensation' },
      { status: 500 }
    )
  }
}
