/**
 * Cron job: Check for expired unpaid orders and auto-cancel them
 * Should be called every 5 minutes (e.g., via Vercel Cron or Supabase Edge Function)
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

    // Call database function to auto-cancel expired orders
    const { data, error } = await supabaseAdmin.rpc('auto_cancel_expired_orders')

    if (error) {
      console.error('Error auto-cancelling expired orders:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to cancel expired orders' },
        { status: 500 }
      )
    }

    const result = data?.[0] || { cancelled_count: 0, cancelled_order_ids: [] }

    return NextResponse.json({
      success: true,
      message: `Cancelled ${result.cancelled_count} expired orders`,
      cancelled_count: result.cancelled_count,
      cancelled_order_ids: result.cancelled_order_ids,
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel expired orders' },
      { status: 500 }
    )
  }
}
