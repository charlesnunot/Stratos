/**
 * Cron job: Check for expired unpaid orders and auto-cancel them
 * Should be called every 5 minutes (e.g., via Vercel Cron or Supabase Edge Function)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-cron-secret'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth

    const supabaseAdmin = await getSupabaseAdmin()

    // Call database function to auto-cancel expired orders
    const { data, error } = await supabaseAdmin.rpc('auto_cancel_expired_orders')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error auto-cancelling expired orders:', error)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'cancel_expired_orders',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to cancel expired orders' },
        { status: 500 }
      )
    }

    const result = data?.[0] || { cancelled_count: 0, cancelled_order_ids: [] }
    const duration = Date.now() - startTime
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'cancel_expired_orders',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: { cancelled_count: result.cancelled_count },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_cancel_expired_orders',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { cancelled_count: result.cancelled_count },
    })

    return NextResponse.json({
      success: true,
      message: `Cancelled ${result.cancelled_count} expired orders`,
      cancelled_count: result.cancelled_count,
      cancelled_order_ids: result.cancelled_order_ids,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Cron job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to cancel expired orders'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'cancel_expired_orders',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_cancel_expired_orders',
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
