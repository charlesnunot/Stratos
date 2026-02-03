/**
 * Cron job: Automatically escalate disputes that have timed out
 * Should be called hourly (e.g., via Vercel Cron)
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

    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting dispute auto-escalation at', new Date().toISOString())
    }

    const { data, error } = await supabaseAdmin.rpc('auto_escalate_disputes')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error auto-escalating disputes:', error)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'auto_escalate_disputes',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to auto-escalate disputes' },
        { status: 500 }
      )
    }

    const result = data?.[0] || { escalated_count: 0, escalated_disputes: [] }
    const duration = Date.now() - startTime
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Dispute auto-escalation completed in', duration, 'ms, escalated:', result.escalated_count)
    }

    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'auto_escalate_disputes',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          escalated_count: result.escalated_count ?? 0,
        },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_auto_escalate_disputes',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { escalated_count: result.escalated_count ?? 0 },
    })

    return NextResponse.json({
      success: true,
      message: 'Dispute auto-escalation completed',
      executionTime: duration,
      escalatedCount: result.escalated_count || 0,
      escalatedDisputes: result.escalated_disputes || [],
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Cron job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to auto-escalate disputes'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'auto_escalate_disputes',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_auto_escalate_disputes',
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
