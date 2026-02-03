/**
 * Cron job: Automatically deduct overdue commissions from seller deposits
 * Should be called daily (e.g., via Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { resolveCommissionPenalty } from '@/lib/commissions/resolve-penalty'
import { logAudit } from '@/lib/api/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const { verifyCronSecret } = await import('@/lib/cron/verify-cron-secret')
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth

    const supabaseAdmin = await getSupabaseAdmin()

    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting overdue commission deduction at', new Date().toISOString())
    }

    // Get all overdue commission obligations
    const { data: overdueObligations, error: obligationsError } = await supabaseAdmin
      .from('commission_payment_obligations')
      .select('*')
      .eq('status', 'overdue')

    if (obligationsError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error fetching overdue obligations:', obligationsError)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'deduct_overdue_commissions',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: obligationsError.message,
        })
      } catch (_) {}
      logAudit({
        action: 'cron_deduct_overdue_commissions',
        resourceType: 'cron',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: obligationsError.message },
      })
      return NextResponse.json(
        { error: obligationsError.message || 'Failed to fetch overdue obligations' },
        { status: 500 }
      )
    }

    if (!overdueObligations || overdueObligations.length === 0) {
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'deduct_overdue_commissions',
          status: 'success',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          metadata: { obligations_processed: 0, successful_deductions: 0 },
        })
      } catch (_) {}
      logAudit({
        action: 'cron_deduct_overdue_commissions',
        resourceType: 'cron',
        result: 'success',
        timestamp: new Date().toISOString(),
        meta: { obligations_processed: 0, successful_deductions: 0 },
      })
      return NextResponse.json({
        success: true,
        message: 'No overdue commissions to deduct',
        executionTime: duration,
        processedCount: 0,
      })
    }

    let totalDeducted = 0
    let processedCount = 0
    let resolvedPenalties = 0
    const errors: string[] = []

    // Process each overdue obligation
    for (const obligation of overdueObligations) {
      try {
        // Try to deduct from deposit
        const { data: deductResult, error: deductError } = await supabaseAdmin.rpc(
          'deduct_commission_from_deposit',
          {
            p_seller_id: obligation.seller_id,
            p_obligation_id: obligation.id,
          }
        )

        if (deductError) {
          errors.push(
            `Obligation ${obligation.id}: ${deductError.message}`
          )
          continue
        }

        const result = deductResult?.[0]
        if (result?.success) {
          totalDeducted += parseFloat(result.deducted_amount || 0)
          processedCount++

          // Per-obligation audit (spec: logAudit cron_deduct_overdue_commission, sellerId, commissionId)
          logAudit({
            action: 'cron_deduct_overdue_commission',
            userId: obligation.seller_id,
            resourceId: obligation.id,
            resourceType: 'commission_obligation',
            result: 'success',
            timestamp: new Date().toISOString(),
            meta: { deducted_amount: result.deducted_amount },
          })

          // Resolve penalties
          const penaltyResult = await resolveCommissionPenalty(
            obligation.seller_id,
            obligation.id,
            supabaseAdmin
          )

          if (penaltyResult.success) {
            resolvedPenalties += penaltyResult.resolvedPenalties
          }
        } else {
          errors.push(
            `Obligation ${obligation.id}: ${result?.error_message || 'Deduction failed'}`
          )
        }
      } catch (error: unknown) {
        errors.push(`Obligation ${obligation.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const duration = Date.now() - startTime
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Overdue commission deduction completed in', duration, 'ms, processed:', processedCount, 'deducted:', totalDeducted)
    }

    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'deduct_overdue_commissions',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          obligations_processed: overdueObligations.length,
          successful_deductions: processedCount,
          total_deducted: totalDeducted,
          resolved_penalties: resolvedPenalties,
          error_count: errors.length,
        },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_deduct_overdue_commissions',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        obligations_processed: overdueObligations.length,
        successful_deductions: processedCount,
        resolved_penalties: resolvedPenalties,
        error_count: errors.length,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Overdue commission deduction completed',
      executionTime: duration,
      obligationsProcessed: overdueObligations.length,
      successfulDeductions: processedCount,
      totalDeducted,
      resolvedPenalties,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Cron job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to deduct overdue commissions'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'deduct_overdue_commissions',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_deduct_overdue_commissions',
      resourceType: 'cron',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: message },
    })
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
