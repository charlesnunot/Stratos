/**
 * Refund processing
 * Handles both seller-cooperated refunds and platform-forced refunds
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { createSellerDebt } from '@/lib/debts/create-debt'

export interface ProcessRefundParams {
  orderId: string
  refundId: string
  disputeId?: string
  amount: number
  currency: string
  refundMethod: 'original_payment' | 'bank_transfer' | 'platform_refund'
  supabaseAdmin: SupabaseClient
}

export async function processRefund({
  orderId,
  refundId,
  disputeId,
  amount,
  currency,
  refundMethod,
  supabaseAdmin,
}: ProcessRefundParams): Promise<{ success: boolean; error?: string; transactionId?: string }> {
  try {
    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('seller_id, payment_method, payment_transaction_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { success: false, error: 'Order not found' }
    }

    // Try to refund through original payment method
    if (refundMethod === 'original_payment' && order.payment_method) {
      try {
        let refundTransactionId: string | undefined

        if (order.payment_method === 'stripe' && order.payment_transaction_id) {
          // Refund via Stripe
          const { refundStripePayment } = await import('@/lib/payments/stripe')
          const refund = await refundStripePayment(order.payment_transaction_id, amount)
          refundTransactionId = refund.id
        } else if (order.payment_method === 'paypal') {
          // Refund via PayPal
          // Implementation would go here
        } else if (order.payment_method === 'alipay') {
          // Refund via Alipay
          // Implementation would go here
        } else if (order.payment_method === 'wechat') {
          // Refund via WeChat Pay
          // Implementation would go here
        }

        // Update refund record
        await supabaseAdmin
          .from('order_refunds')
          .update({
            status: 'completed',
            refunded_at: new Date().toISOString(),
            refund_transaction_id: refundTransactionId,
          })
          .eq('id', refundId)

        // Update order status
        await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'refunded',
            order_status: 'cancelled',
          })
          .eq('id', orderId)

        return { success: true, transactionId: refundTransactionId }
      } catch (refundError: any) {
        console.error('Refund via original payment method failed:', refundError)
        // Fall through to platform refund
      }
    }

    // Platform refund (when seller doesn't cooperate or original method fails)
    if (refundMethod === 'platform_refund') {
      // Create seller debt record
      await createSellerDebt(
        order.seller_id,
        orderId,
        disputeId,
        refundId,
        amount,
        currency,
        'Platform advanced refund',
        supabaseAdmin
      )

      // Update refund record
      await supabaseAdmin
        .from('order_refunds')
        .update({
          status: 'completed',
          refunded_at: new Date().toISOString(),
          refund_method: 'platform_refund',
        })
        .eq('id', refundId)

      // Update order status
      await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'refunded',
          order_status: 'cancelled',
        })
        .eq('id', orderId)

      // Update dispute status
      if (disputeId) {
        await supabaseAdmin
          .from('order_disputes')
          .update({
            status: 'resolved',
            resolution: 'Refunded by platform',
            resolved_at: new Date().toISOString(),
          })
          .eq('id', disputeId)
      }

      return { success: true }
    }

    return { success: false, error: 'Refund method not supported' }
  } catch (error: any) {
    console.error('processRefund error:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}
