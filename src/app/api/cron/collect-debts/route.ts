/**
 * Cron job: Automatically collect debts from seller deposits
 * Should be called daily (e.g., via Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server'
import { collectDebtFromDeposit } from '@/lib/debts/collect-debt'

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

    const startTime = Date.now()
    console.log('[Cron] Starting debt collection at', new Date().toISOString())

    // Get all sellers with pending debts
    const { data: debts } = await supabaseAdmin
      .from('seller_debts')
      .select('seller_id')
      .eq('status', 'pending')

    const uniqueSellers = Array.from(
      new Set(debts?.map((d: any) => d.seller_id) || [])
    )

    let totalCollected = 0
    let totalCount = 0
    const errors: string[] = []

    // Process each seller
    for (const sellerId of uniqueSellers) {
      try {
        const result = await collectDebtFromDeposit(sellerId, supabaseAdmin)
        if (result.success) {
          totalCollected += result.totalCollected
          totalCount += result.collectedCount
        } else {
          errors.push(`Seller ${sellerId}: ${result.error}`)
        }
      } catch (error: any) {
        errors.push(`Seller ${sellerId}: ${error.message}`)
      }
    }

    const duration = Date.now() - startTime
    console.log('[Cron] Debt collection completed in', duration, 'ms')

    return NextResponse.json({
      success: true,
      message: 'Debt collection completed',
      executionTime: duration,
      sellersProcessed: uniqueSellers.length,
      debtsCollected: totalCount,
      totalCollected,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to collect debts' },
      { status: 500 }
    )
  }
}
