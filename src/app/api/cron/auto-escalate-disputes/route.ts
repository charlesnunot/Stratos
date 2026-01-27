/**
 * Cron job: Automatically escalate disputes that have timed out
 * Should be called hourly (e.g., via Vercel Cron)
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
    console.log('[Cron] Starting dispute auto-escalation at', new Date().toISOString())

    // Call database function to auto-escalate disputes
    const { data, error } = await supabaseAdmin.rpc('auto_escalate_disputes')

    if (error) {
      console.error('[Cron] Error auto-escalating disputes:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to auto-escalate disputes' },
        { status: 500 }
      )
    }

    const result = data?.[0] || { escalated_count: 0, escalated_disputes: [] }
    const duration = Date.now() - startTime
    console.log('[Cron] Dispute auto-escalation completed in', duration, 'ms')
    console.log('[Cron] Escalated', result.escalated_count, 'disputes')

    // Log execution result
    await supabaseAdmin
      .from('cron_logs')
      .insert({
        job_name: 'auto_escalate_disputes',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          escalated_count: result.escalated_count,
          escalated_disputes: result.escalated_disputes,
        },
      })
      .catch((logError) => {
        // Ignore log errors - cron_logs table might not exist
        console.warn('[Cron] Failed to log execution:', logError)
      })

    return NextResponse.json({
      success: true,
      message: 'Dispute auto-escalation completed',
      executionTime: duration,
      escalatedCount: result.escalated_count || 0,
      escalatedDisputes: result.escalated_disputes || [],
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to auto-escalate disputes' },
      { status: 500 }
    )
  }
}
