/**
 * Cron job: Automatically deduct overdue commissions from seller deposits
 * Should be called daily (e.g., via Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveCommissionPenalty } from '@/lib/commissions/resolve-penalty'

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
    console.log('[Cron] Starting overdue commission deduction at', new Date().toISOString())

    // Get all overdue commission obligations
    const { data: overdueObligations, error: obligationsError } = await supabaseAdmin
      .from('commission_payment_obligations')
      .select('*')
      .eq('status', 'overdue')

    if (obligationsError) {
      console.error('[Cron] Error fetching overdue obligations:', obligationsError)
      return NextResponse.json(
        { error: obligationsError.message || 'Failed to fetch overdue obligations' },
        { status: 500 }
      )
    }

    if (!overdueObligations || overdueObligations.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No overdue commissions to deduct',
        executionTime: Date.now() - startTime,
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
      } catch (error: any) {
        errors.push(`Obligation ${obligation.id}: ${error.message}`)
      }
    }

    const duration = Date.now() - startTime
    console.log('[Cron] Overdue commission deduction completed in', duration, 'ms')
    console.log('[Cron] Processed', processedCount, 'obligations, deducted', totalDeducted)

    // Log execution result
    await supabaseAdmin
      .from('cron_logs')
      .insert({
        job_name: 'deduct_overdue_commissions',
        status: errors.length > 0 ? 'partial' : 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          obligations_processed: overdueObligations.length,
          successful_deductions: processedCount,
          total_deducted: totalDeducted,
          resolved_penalties: resolvedPenalties,
          errors: errors.length > 0 ? errors : undefined,
        },
      })
      .catch((logError) => {
        // Ignore log errors - cron_logs table might not exist
        console.warn('[Cron] Failed to log execution:', logError)
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
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to deduct overdue commissions' },
      { status: 500 }
    )
  }
}
