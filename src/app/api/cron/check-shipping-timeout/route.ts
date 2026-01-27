/**
 * Cron job: Check for shipping timeouts and auto-create disputes
 * Should be called daily (e.g., via Vercel Cron or Supabase Edge Function)
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

    // Call database function to auto-create shipping disputes
    const startTime = Date.now()
    console.log('[Cron] Starting shipping timeout check at', new Date().toISOString())
    
    const { error, data } = await supabaseAdmin.rpc('auto_create_shipping_dispute')

    if (error) {
      console.error('[Cron] Error auto-creating shipping disputes:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to check shipping timeouts' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    console.log('[Cron] Shipping timeout check completed in', duration, 'ms')

    // Log execution result
    await supabaseAdmin.from('cron_logs').insert({
      job_name: 'check_shipping_timeout',
      status: 'success',
      execution_time_ms: duration,
      executed_at: new Date().toISOString(),
    }).catch((logError) => {
      // Ignore log errors - cron_logs table might not exist
      console.warn('[Cron] Failed to log execution:', logError)
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Shipping timeouts checked',
      executionTime: duration 
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check shipping timeouts' },
      { status: 500 }
    )
  }
}
