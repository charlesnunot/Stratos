/**
 * Cron job: Send shipping reminders to sellers
 * Should be called daily (e.g., via Vercel Cron or Supabase Edge Function)
 * Sends reminders 3 days before shipping deadline
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

    // Call database function to send shipping reminders
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting shipping reminder check at', new Date().toISOString())
    }
    
    const { error } = await supabaseAdmin.rpc('send_shipping_reminders')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error sending shipping reminders:', error)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'send_shipping_reminders',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to send shipping reminders' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Shipping reminder check completed in', duration, 'ms')
    }
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'send_shipping_reminders',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
      })
    } catch (_) {}

    logAudit({
      action: 'cron_send_shipping_reminders',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Shipping reminders sent',
      executionTime: duration 
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Cron] Shipping reminder error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to send shipping reminders'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'send_shipping_reminders',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_send_shipping_reminders',
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
