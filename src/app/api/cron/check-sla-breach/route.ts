/**
 * Cron job: Check SLA breach for support tickets
 * Runs every hour to mark overdue tickets
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { verifyCronSecret } from '@/lib/cron/verify-cron-secret'

export async function GET(request: NextRequest) {
  // Verify cron secret using unified guard
  const authError = verifyCronSecret(request)
  if (authError) {
    return authError
  }

  try {
    const supabase = await getSupabaseAdmin()
    
    // Call the SLA breach check function
    const { error } = await supabase.rpc('check_sla_breach')
    
    if (error) {
      console.error('[check-sla-breach] Error:', error)
      return NextResponse.json(
        { error: 'Failed to check SLA breach', details: error.message },
        { status: 500 }
      )
    }

    // Get statistics
    const { data: stats, error: statsError } = await supabase
      .from('support_ticket_sla_stats')
      .select('*')

    if (statsError) {
      console.error('[check-sla-breach] Stats error:', statsError)
    }

    // Get overdue tickets count
    const { count: overdueCount, error: countError } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('is_sla_breached', true)
      .in('status', ['open', 'in_progress'])

    if (countError) {
      console.error('[check-sla-breach] Count error:', countError)
    }

    return NextResponse.json({
      success: true,
      stats: stats || [],
      overdueTickets: overdueCount || 0,
      checkedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    console.error('[check-sla-breach] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
