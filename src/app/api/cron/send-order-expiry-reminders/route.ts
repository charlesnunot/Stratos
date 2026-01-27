/**
 * Cron job: Send order expiry reminders
 * Should be called every 5 minutes (e.g., via Vercel Cron)
 * Sends reminders 10 minutes before orders expire
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (if using Vercel Cron)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const startTime = Date.now()
    console.log('[Cron] Starting order expiry reminder check at', new Date().toISOString())

    // Call database function to send order expiry reminders
    const { data, error } = await supabaseAdmin.rpc('send_order_expiry_reminders')

    if (error) {
      console.error('[Cron] Error sending order expiry reminders:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to send order expiry reminders' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const remindersSent = data?.[0]?.reminders_sent || 0

    console.log('[Cron] Order expiry reminder check completed in', duration, 'ms')
    console.log('[Cron] Reminders sent:', remindersSent)

    // Log execution result
    await supabaseAdmin
      .from('cron_logs')
      .insert({
        job_name: 'send_order_expiry_reminders',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          reminders_sent: remindersSent,
        },
      })
      .catch((logError) => {
        // Ignore log errors - cron_logs table might not exist
        console.warn('[Cron] Failed to log execution:', logError)
      })

    return NextResponse.json({
      success: true,
      message: 'Order expiry reminders sent',
      executionTime: duration,
      remindersSent,
    })
  } catch (error: any) {
    console.error('[Cron] Order expiry reminder error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send order expiry reminders' },
      { status: 500 }
    )
  }
}
