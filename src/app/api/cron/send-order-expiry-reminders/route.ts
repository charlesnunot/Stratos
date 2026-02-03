/**
 * Cron job: Send order expiry reminders
 * Should be called every 5 minutes (e.g., via Vercel Cron)
 * Sends reminders 10 minutes before orders expire
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
      console.log('[Cron] Starting order expiry reminder check at', new Date().toISOString())
    }

    const { data, error } = await supabaseAdmin.rpc('send_order_expiry_reminders')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error sending order expiry reminders:', error)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'send_order_expiry_reminders',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to send order expiry reminders' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const remindersSent = data?.[0]?.reminders_sent || 0

    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Order expiry reminder check completed in', duration, 'ms, reminders:', remindersSent)
    }
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'send_order_expiry_reminders',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: { reminders_sent: remindersSent },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_send_order_expiry_reminders',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { reminders_sent: remindersSent },
    })

    return NextResponse.json({
      success: true,
      message: 'Order expiry reminders sent',
      executionTime: duration,
      remindersSent,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Cron] Order expiry reminder error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to send order expiry reminders'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'send_order_expiry_reminders',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_send_order_expiry_reminders',
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
