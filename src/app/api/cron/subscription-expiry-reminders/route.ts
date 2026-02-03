/**
 * Cron job: Send subscription expiry reminders
 * Should be called daily (e.g., via Vercel Cron)
 * Sends reminders 3 days and 1 day before subscription expires
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const { verifyCronSecret } = await import('@/lib/cron/verify-cron-secret')
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth

    const supabaseAdmin = await getSupabaseAdmin()

    const { data, error } = await supabaseAdmin.rpc('send_subscription_expiry_reminders')

    if (error) {
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'subscription_expiry_reminders',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to send subscription expiry reminders' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const row = data?.[0]
    const reminders3d = row?.reminders_3d_sent ?? 0
    const reminders1d = row?.reminders_1d_sent ?? 0

    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'subscription_expiry_reminders',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: { reminders_3d: reminders3d, reminders_1d: reminders1d },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_subscription_expiry_reminders',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { reminders_3d: reminders3d, reminders_1d: reminders1d },
    })

    return NextResponse.json({
      success: true,
      message: 'Subscription expiry reminders sent',
      reminders3d,
      reminders1d,
      executionTime: duration,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send subscription expiry reminders'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'subscription_expiry_reminders',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_subscription_expiry_reminders',
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
