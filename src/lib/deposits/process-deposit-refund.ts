/**
 * Process deposit refund
 * Handles refunding deposit lots to sellers
 */

import { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export interface ProcessDepositRefundParams {
  lotId: string
  supabaseAdmin: SupabaseClient
}

export async function processDepositRefund({
  lotId,
  supabaseAdmin,
}: ProcessDepositRefundParams): Promise<{
  success: boolean
  error?: string
  transactionId?: string
}> {
  try {
    // Get lot details
    const { data: lot, error: lotError } = await supabaseAdmin
      .from('seller_deposit_lots')
      .select('*')
      .eq('id', lotId)
      .single()

    if (lotError || !lot) {
      return { success: false, error: 'Deposit lot not found' }
    }

    if (lot.status !== 'refunding') {
      return { success: false, error: `Lot is not in refunding status. Current: ${lot.status}` }
    }

    // Get payment transaction
    let refundTransactionId: string | undefined
    let refundFeeAmount = 0
    let refundedAmount = lot.required_amount

    // Process refund based on payment method
    if (lot.payment_provider === 'stripe' && lot.payment_session_id) {
      // Get original payment transaction
      const { data: paymentTx } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('id', lot.payment_session_id)
        .single()

      if (paymentTx?.stripe_payment_intent_id) {
        const secretKey = process.env.STRIPE_SECRET_KEY
        if (!secretKey) {
          return { success: false, error: 'STRIPE_SECRET_KEY is not configured' }
        }
        const stripe = new Stripe(secretKey, {
          apiVersion: '2025-12-15.clover',
        })

        // Calculate refund amount (deduct Stripe fee)
        // Stripe fee is typically 2.9% + $0.30
        const stripeFee = lot.required_amount * 0.029 + 0.30
        refundFeeAmount = Math.min(stripeFee, lot.required_amount)
        refundedAmount = lot.required_amount - refundFeeAmount

        // Create Stripe refund
        const refund = await stripe.refunds.create({
          payment_intent: paymentTx.stripe_payment_intent_id,
          amount: Math.round(refundedAmount * 100), // Convert to cents
        })

        // Create refund transaction record
        const { data: refundTx, error: txError } = await supabaseAdmin
          .from('payment_transactions')
          .insert({
            user_id: lot.seller_id,
            transaction_type: 'deposit_refund',
            amount: refundedAmount,
            currency: lot.currency,
            payment_method: 'stripe',
            stripe_refund_id: refund.id,
            status: 'completed',
            metadata: {
              deposit_lot_id: lot.id,
              original_amount: lot.required_amount,
              refund_fee: refundFeeAmount,
            },
          })
          .select()
          .single()

        if (txError) {
          console.error('Failed to create refund transaction:', txError)
        } else {
          refundTransactionId = refundTx.id
        }
      }
    } else {
      // For non-Stripe payments, mark as manual processing required
      return {
        success: false,
        error: `Manual refund processing required for payment method: ${lot.payment_provider}`,
      }
    }

    // Update lot status
    const { error: updateError } = await supabaseAdmin
      .from('seller_deposit_lots')
      .update({
        status: 'refunded',
        refund_fee_amount: refundFeeAmount,
        refunded_amount: refundedAmount,
        refund_transaction_id: refundTransactionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lotId)

    if (updateError) {
      console.error('Failed to update lot status:', updateError)
      return { success: false, error: 'Failed to update lot status' }
    }

    // Send notification (use content_key for i18n)
    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      user_id: lot.seller_id,
      type: 'deposit',
      title: 'Deposit Refund Completed',
      content: `Your deposit refund has been completed. Refunded: ${refundedAmount.toFixed(2)} ${lot.currency} (fee: ${refundFeeAmount.toFixed(2)} ${lot.currency}).`,
      related_id: lot.id,
      related_type: 'deposit_lot',
      link: `/seller/deposit`,
      content_key: 'deposit_refund_completed',
      content_params: {
        refundedAmount: refundedAmount.toFixed(2),
        feeAmount: refundFeeAmount.toFixed(2),
        currency: lot.currency,
      },
    })
    if (notifError) {
      console.error('Failed to send notification:', notifError)
    }

    return {
      success: true,
      transactionId: refundTransactionId,
    }
  } catch (error: any) {
    console.error('processDepositRefund error:', error)
    return { success: false, error: error.message || 'Failed to process refund' }
  }
}
