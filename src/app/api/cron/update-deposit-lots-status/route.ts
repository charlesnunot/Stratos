/**
 * Cron job: Update deposit lots from 'held' to 'refundable' status
 * Should be called daily (e.g., via Vercel Cron)
 * This addresses Gap 2: held → refundable status transition
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

    // Call database function to update deposit lots status
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting deposit lots status update at', new Date().toISOString())
    }

    const { data, error } = await supabaseAdmin.rpc('update_deposit_lots_to_refundable')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error updating deposit lots:', error)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'update_deposit_lots_status',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to update deposit lots' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const result = data?.[0] || { updated_count: 0, updated_lot_ids: [] }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Deposit lots status update completed in', duration, 'ms, updated:', result.updated_count)
    }
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'update_deposit_lots_status',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: { updated_count: result.updated_count ?? 0 },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_update_deposit_lots_status',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { updated_count: result.updated_count ?? 0 },
    })

    return NextResponse.json({
      success: true,
      updated_count: result.updated_count,
      updated_lot_ids: result.updated_lot_ids || [],
      execution_time_ms: duration,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Cron] Deposit lots status update error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to update deposit lots status'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'update_deposit_lots_status',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_update_deposit_lots_status',
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
