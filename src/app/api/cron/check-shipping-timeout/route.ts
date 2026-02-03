/**
 * Cron job: Check for shipping timeouts and auto-create disputes
 * Should be called daily (e.g., via Vercel Cron or Supabase Edge Function)
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
      console.log('[Cron] Starting shipping timeout check at', new Date().toISOString())
    }

    const { error, data } = await supabaseAdmin.rpc('auto_create_shipping_dispute')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error auto-creating shipping disputes:', error)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'check_shipping_timeout',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to check shipping timeouts' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Shipping timeout check completed in', duration, 'ms')
    }
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'check_shipping_timeout',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
      })
    } catch (_) {}

    logAudit({
      action: 'cron_check_shipping_timeout',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Shipping timeouts checked',
      executionTime: duration 
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Cron job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to check shipping timeouts'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'check_shipping_timeout',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_check_shipping_timeout',
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
