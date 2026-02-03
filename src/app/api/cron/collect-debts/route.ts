/**
 * Cron job: Automatically collect debts from seller deposits
 * Should be called daily (e.g., via Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-cron-secret'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { collectDebtFromDeposit } from '@/lib/debts/collect-debt'
import { logAudit } from '@/lib/api/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth

    const supabaseAdmin = await getSupabaseAdmin()

    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting debt collection at', new Date().toISOString())
    }

    // Get all sellers with pending debts
    const { data: debts, error: debtsError } = await supabaseAdmin
      .from('seller_debts')
      .select('seller_id')
      .eq('status', 'pending')

    if (debtsError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error fetching seller debts:', debtsError)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'collect_debts',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: debtsError.message,
        })
      } catch (_) {}
      logAudit({
        action: 'cron_collect_debts',
        resourceType: 'cron',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: debtsError.message },
      })
      return NextResponse.json(
        { error: debtsError.message || 'Failed to fetch seller debts' },
        { status: 500 }
      )
    }

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
      } catch (error: unknown) {
        errors.push(`Seller ${sellerId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const duration = Date.now() - startTime
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Debt collection completed in', duration, 'ms')
    }
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'collect_debts',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          sellers_processed: uniqueSellers.length,
          debts_collected: totalCount,
          total_collected: totalCollected,
          error_count: errors.length,
        },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_collect_debts',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        sellers_processed: uniqueSellers.length,
        debts_collected: totalCount,
        error_count: errors.length,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Debt collection completed',
      executionTime: duration,
      sellersProcessed: uniqueSellers.length,
      debtsCollected: totalCount,
      totalCollected,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Cron job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to collect debts'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'collect_debts',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_collect_debts',
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
