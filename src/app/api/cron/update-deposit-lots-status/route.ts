/**
 * Cron job: Update deposit lots from 'held' to 'refundable' status
 * Should be called daily (e.g., via Vercel Cron)
 * This addresses Gap 2: held → refundable status transition
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

    // Call database function to update deposit lots status
    const startTime = Date.now()
    console.log('[Cron] Starting deposit lots status update at', new Date().toISOString())
    
    const { data, error } = await supabaseAdmin.rpc('update_deposit_lots_to_refundable')

    if (error) {
      console.error('[Cron] Error updating deposit lots:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update deposit lots' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const result = data?.[0] || { updated_count: 0, updated_lot_ids: [] }

    console.log('[Cron] Deposit lots status update completed in', duration, 'ms')
    console.log('[Cron] Updated lots:', result.updated_count)

    // Log execution result (ignore errors - cron_logs table might not exist)
    try {
      const { error: logError } = await supabaseAdmin.from('cron_logs').insert({
        job_name: 'update_deposit_lots_status',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          updated_count: result.updated_count,
          updated_lot_ids: result.updated_lot_ids,
        },
      })
      if (logError) {
        console.warn('[Cron] Failed to log execution:', logError)
      }
    } catch (logError) {
      console.warn('[Cron] Failed to log execution:', logError)
    }

    return NextResponse.json({
      success: true,
      updated_count: result.updated_count,
      updated_lot_ids: result.updated_lot_ids || [],
      execution_time_ms: duration,
    })
  } catch (error: any) {
    console.error('[Cron] Deposit lots status update error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update deposit lots status' },
      { status: 500 }
    )
  }
}
