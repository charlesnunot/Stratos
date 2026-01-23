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
    const { error } = await supabaseAdmin.rpc('auto_create_shipping_dispute')

    if (error) {
      console.error('Error auto-creating shipping disputes:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to check shipping timeouts' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'Shipping timeouts checked' })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check shipping timeouts' },
      { status: 500 }
    )
  }
}
