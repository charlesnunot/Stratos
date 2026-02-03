/**
 * API endpoint for deducting violation penalties from seller deposits
 * This deducts funds from seller's deposit balance and records the violation
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { deductFromDeposit } from '@/lib/deposits/deduct-from-deposit'
import { logAudit } from '@/lib/api/audit'

export async function POST(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    const { user } = authResult.data

    const body = await request.json()
    const {
      sellerId,
      amount,
      currency,
      violationType,
      violationReason,
      relatedOrderId,
      relatedDisputeId,
    } = body

    if (!sellerId || !amount || !violationType || !violationReason) {
      return NextResponse.json(
        { error: 'Missing required fields: sellerId, amount, violationType, violationReason' },
        { status: 400 }
      )
    }

    const reasonTrimmed = String(violationReason).trim()
    if (reasonTrimmed.length === 0) {
      return NextResponse.json({ error: 'violationReason cannot be empty' }, { status: 400 })
    }
    if (reasonTrimmed.length > 500) {
      return NextResponse.json(
        { error: 'violationReason must be at most 500 characters' },
        { status: 400 }
      )
    }

    const typeTrimmed = String(violationType).trim()
    if (typeTrimmed.length === 0) {
      return NextResponse.json({ error: 'violationType cannot be empty' }, { status: 400 })
    }
    if (typeTrimmed.length > 50) {
      return NextResponse.json(
        { error: 'violationType must be at most 50 characters' },
        { status: 400 }
      )
    }

    // Validate amount
    const numericAmount = parseFloat(String(amount))
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Verify seller exists
    const { data: seller, error: sellerError } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', sellerId)
      .single()

    if (sellerError || !seller) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      )
    }

    // Check if user is a seller
    if (seller.role !== 'seller' && seller.role !== 'seller_suspended') {
      return NextResponse.json(
        { error: 'User is not a seller' },
        { status: 400 }
      )
    }

    // Create violation record (optional - table may not exist)
    let violationId: string | null = null
    try {
      const { data: violation, error: violationError } = await supabaseAdmin
        .from('seller_violations')
        .insert({
          seller_id: sellerId,
          violation_type: typeTrimmed,
          violation_reason: reasonTrimmed,
          penalty_amount: numericAmount,
          currency: currency || 'CNY',
          status: 'pending',
          related_order_id: relatedOrderId || null,
          related_dispute_id: relatedDisputeId || null,
          created_by: user.id,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (!violationError && violation) {
        violationId = violation.id
      }
    } catch (error: unknown) {
      // seller_violations table may not exist, continue without creating violation record
      if (process.env.NODE_ENV === 'development') {
        console.warn('Violation record table may not exist, continuing without it:', error instanceof Error ? error.message : error)
      }
    }

    // Deduct from deposit (use fallback relatedId when violation record wasn't created)
    const deductionResult = await deductFromDeposit({
      sellerId,
      amount: numericAmount,
      currency: currency || 'CNY',
      reason: `违规扣款: ${reasonTrimmed}`,
      relatedId: violationId ?? `violation-deduct-${sellerId}-${Date.now()}`,
      relatedType: 'violation',
      supabaseAdmin,
    })

    if (!deductionResult.success) {
      // If violation record was created, update its status
      if (violationId) {
        try {
          await supabaseAdmin
            .from('seller_violations')
            .update({
              status: 'failed',
              failure_reason: deductionResult.error || 'Insufficient deposit balance',
            })
            .eq('id', violationId)
        } catch (error) {
          // Ignore if table doesn't exist
        }
      }

      logAudit({
        action: 'violation_deduction',
        userId: user.id,
        resourceId: sellerId,
        resourceType: 'seller_deposit',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: deductionResult.error },
      })
      return NextResponse.json(
        {
          success: false,
          error: deductionResult.error || 'Failed to deduct from deposit',
          deductedAmount: 0,
          remainingBalance: deductionResult.remainingBalance,
        },
        { status: 400 }
      )
    }

    // Update violation record status to completed
    if (violationId) {
      try {
        await supabaseAdmin
          .from('seller_violations')
          .update({
            status: 'completed',
            deducted_at: new Date().toISOString(),
            deducted_amount: deductionResult.deductedAmount,
          })
          .eq('id', violationId)
      } catch (error) {
        // Ignore if table doesn't exist
      }
    }

    // Create notification for seller (use content_key for i18n)
    await supabaseAdmin.from('notifications').insert({
      user_id: sellerId,
      type: 'system',
      title: 'Violation Deduction',
      content: `A deduction of ${deductionResult.deductedAmount.toFixed(2)} ${deductionResult.deductedAmountCurrency} has been made from your deposit. Reason: ${reasonTrimmed}. Remaining balance: ${deductionResult.remainingBalance.toFixed(2)} ${deductionResult.deductedAmountCurrency}.`,
      related_type: 'order',
      related_id: relatedOrderId || null,
      link: '/seller/deposit',
      content_key: 'violation_penalty',
      content_params: {
        deductedAmount: deductionResult.deductedAmount.toFixed(2),
        currency: deductionResult.deductedAmountCurrency,
        reason: reasonTrimmed,
        remainingBalance: deductionResult.remainingBalance.toFixed(2),
      },
    })

    logAudit({
      action: 'violation_deduction',
      userId: user.id,
      resourceId: sellerId,
      resourceType: 'seller_deposit',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { violationId, deductedAmount: deductionResult.deductedAmount },
    })

    return NextResponse.json({
      success: true,
      violationId: violationId,
      deductedAmount: deductionResult.deductedAmount,
      deductedAmountCurrency: deductionResult.deductedAmountCurrency,
      remainingBalance: deductionResult.remainingBalance,
      message: 'Violation deduction completed successfully',
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Violation penalty deduction error:', error)
    }
    logAudit({
      action: 'violation_deduction',
      resourceType: 'seller_deposit',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: error instanceof Error ? error.message : String(error) },
    })
    const message = error instanceof Error ? error.message : 'Failed to deduct violation penalty'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
