/**
 * Cron job: Check overdue commission payments and apply penalties
 * Should be called daily (e.g., via Vercel Cron or Supabase Edge Function)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-cron-secret'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { checkAndApplyPenalties } from '@/lib/commissions/penalty-manager'
import { logAudit } from '@/lib/api/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth

    const supabaseAdmin = await getSupabaseAdmin()

    await checkAndApplyPenalties(supabaseAdmin)

    const duration = Date.now() - startTime
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'check_overdue_commissions',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
      })
    } catch (_) {}

    logAudit({
      action: 'cron_check_overdue_commissions',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'Overdue commissions checked' })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Cron job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to check overdue commissions'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'check_overdue_commissions',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_check_overdue_commissions',
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
