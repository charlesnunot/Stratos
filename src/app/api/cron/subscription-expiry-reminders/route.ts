/**
 * Cron job: Send subscription expiry reminders
 * Should be called daily (e.g., via Vercel Cron)
 * Sends reminders 3 days and 1 day before subscription expires
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
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
    const { data, error } = await supabaseAdmin.rpc('send_subscription_expiry_reminders')

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to send subscription expiry reminders' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const row = data?.[0]
    const reminders3d = row?.reminders_3d_sent ?? 0
    const reminders1d = row?.reminders_1d_sent ?? 0

    await supabaseAdmin.from('cron_logs').insert({
      job_name: 'subscription_expiry_reminders',
      status: 'success',
      execution_time_ms: duration,
      executed_at: new Date().toISOString(),
      metadata: { reminders_3d: reminders3d, reminders_1d: reminders1d },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: 'Subscription expiry reminders sent',
      reminders3d,
      reminders1d,
      executionTime: duration,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send subscription expiry reminders' },
      { status: 500 }
    )
  }
}
