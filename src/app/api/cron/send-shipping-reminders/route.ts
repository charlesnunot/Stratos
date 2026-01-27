/**
 * Cron job: Send shipping reminders to sellers
 * Should be called daily (e.g., via Vercel Cron or Supabase Edge Function)
 * Sends reminders 3 days before shipping deadline
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

    // Call database function to send shipping reminders
    const startTime = Date.now()
    console.log('[Cron] Starting shipping reminder check at', new Date().toISOString())
    
    const { error } = await supabaseAdmin.rpc('send_shipping_reminders')

    if (error) {
      console.error('[Cron] Error sending shipping reminders:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to send shipping reminders' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    console.log('[Cron] Shipping reminder check completed in', duration, 'ms')

    return NextResponse.json({ 
      success: true, 
      message: 'Shipping reminders sent',
      executionTime: duration 
    })
  } catch (error: any) {
    console.error('[Cron] Shipping reminder error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send shipping reminders' },
      { status: 500 }
    )
  }
}
