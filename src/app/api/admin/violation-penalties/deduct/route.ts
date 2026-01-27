/**
 * API endpoint for deducting violation penalties from seller deposits
 * This deducts funds from seller's deposit balance and records the violation
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { deductFromDeposit } from '@/lib/deposits/deduct-from-deposit'

export async function POST(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

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
          violation_type: violationType,
          violation_reason: violationReason,
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
    } catch (error: any) {
      // seller_violations table may not exist, continue without creating violation record
      console.warn('Violation record table may not exist, continuing without it:', error.message)
    }

    // Deduct from deposit
    const deductionResult = await deductFromDeposit({
      sellerId,
      amount: numericAmount,
      currency: currency || 'CNY',
      reason: `违规扣款: ${violationReason}`,
      relatedId: violation?.id || null,
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

    // Create notification for seller
    await supabaseAdmin.from('notifications').insert({
      user_id: sellerId,
      type: 'system',
      title: '违规扣款通知',
      content: `您的保证金中已扣除 ${deductionResult.deductedAmount.toFixed(2)} ${deductionResult.deductedAmountCurrency}。原因：${violationReason}。剩余保证金：${deductionResult.remainingBalance.toFixed(2)} ${deductionResult.deductedAmountCurrency}。`,
      related_type: 'order',
      related_id: relatedOrderId || null,
      link: '/seller/deposit',
    })

    return NextResponse.json({
      success: true,
      violationId: violationId,
      deductedAmount: deductionResult.deductedAmount,
      deductedAmountCurrency: deductionResult.deductedAmountCurrency,
      remainingBalance: deductionResult.remainingBalance,
      message: '违规扣款已成功扣除',
    })
  } catch (error: any) {
    console.error('Violation penalty deduction error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to deduct violation penalty' },
      { status: 500 }
    )
  }
}
