/**
 * Refund processing
 * Handles both seller-cooperated refunds and platform-forced refunds
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { createSellerDebt } from '@/lib/debts/create-debt'
import { logPayment, LogLevel } from './logger'

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
    // Get order details (total_amount needed for WeChat refund)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('seller_id, payment_method, payment_transaction_id, payment_intent_id, order_number, currency, total_amount, order_status')
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
        } else if (order.payment_method === 'alipay') {
          // Refund via Alipay
          const { createAlipayRefund } = await import('@/lib/payments/alipay')
          // Use payment_intent_id as trade_no if available (Alipay transaction ID)
          const refundResult = await createAlipayRefund({
            outTradeNo: order.order_number || orderId,
            tradeNo: order.payment_intent_id || undefined,
            refundAmount: amount,
            refundReason: 'Order cancellation refund',
            outRequestNo: `refund_${refundId}_${Date.now()}`.slice(0, 64),
          })
          // Alipay refund returns trade_no (Alipay transaction ID) or out_trade_no
          refundTransactionId = refundResult.trade_no || refundResult.out_trade_no || `alipay_refund_${Date.now()}`
        } else if (order.payment_method === 'wechat') {
          // Refund via WeChat Pay (requires transaction_id, certificate)
          const transactionId = order.payment_intent_id || order.payment_transaction_id
          if (!transactionId || !order.order_number) {
            throw new Error('WeChat Pay transaction ID or order number not found')
          }
          const totalAmount = parseFloat(String(order.total_amount ?? 0))
          const totalFeeFen = Math.round(totalAmount * 100)
          const refundFeeFen = Math.round(amount * 100)
          const { createWeChatPayRefund } = await import('@/lib/payments/wechat')
          const refundResult = await createWeChatPayRefund({
            transactionId,
            outTradeNo: order.order_number,
            totalFeeFen,
            refundFeeFen,
            outRefundNo: `refund_${refundId}_${Date.now()}`.slice(0, 64),
            refundDesc: 'Order cancellation refund',
          })
          refundTransactionId = refundResult.refund_id || `wechat_refund_${Date.now()}`
        } else if (order.payment_method === 'paypal') {
          // Refund via PayPal (requires capture ID)
          let captureId = order.payment_intent_id || order.payment_transaction_id
          if (!captureId) {
            const { data: pt } = await supabaseAdmin
              .from('payment_transactions')
              .select('provider_ref')
              .eq('related_id', orderId)
              .eq('type', 'order')
              .eq('provider', 'paypal')
              .order('paid_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            captureId = pt?.provider_ref ?? null
          }
          if (!captureId) {
            throw new Error('PayPal capture ID not found')
          }
          const { refundPayPalPayment } = await import('@/lib/payments/paypal')
          const refundResult = await refundPayPalPayment(captureId, amount, order.currency, 'Order cancellation refund')
          refundTransactionId = refundResult.id || `paypal_refund_${Date.now()}`
        }

        // Check if this is a partial refund
        const orderTotal = parseFloat(String(order.total_amount || 0))
        const isPartialRefund = amount < orderTotal - 0.01 // Allow small floating point differences

        // Update refund record
        await supabaseAdmin
          .from('order_refunds')
          .update({
            status: 'completed',
            refunded_at: new Date().toISOString(),
            refund_transaction_id: refundTransactionId,
          })
          .eq('id', refundId)

        // Update order status based on refund type
        if (isPartialRefund) {
          // Partial refund: update payment transaction status
          await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: 'partially_refunded',
              refunded_at: new Date().toISOString(),
            })
            .eq('related_id', orderId)
            .eq('type', 'order')
            .eq('status', 'paid')

          // Update order status (keep as paid if partial refund)
          await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'partially_refunded',
              // Don't cancel order for partial refund
            })
            .eq('id', orderId)
        } else {
          // Full refund: update payment_transactions, then atomically cancel order and restore stock
          await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: 'refunded',
              refunded_at: new Date().toISOString(),
            })
            .eq('related_id', orderId)
            .eq('type', 'order')
            .eq('status', 'paid')

          // Only restore stock when order is not yet shipped/completed (RPC rejects those)
          const canRestoreStock = order.order_status !== 'shipped' && order.order_status !== 'completed'
          if (canRestoreStock) {
            const { data: cancelResult, error: cancelError } = await supabaseAdmin
              .rpc('cancel_order_and_restore_stock', { p_order_id: orderId })
            if (cancelError || !cancelResult?.[0]?.success) {
              logPayment(LogLevel.ERROR, 'cancel_order_and_restore_stock failed after full refund', {
                orderId,
                error: cancelError?.message ?? cancelResult?.[0]?.error_message ?? 'unknown',
              })
              return { success: false, error: cancelResult?.[0]?.error_message ?? cancelError?.message ?? 'Failed to restore stock' }
            }
            await supabaseAdmin
              .from('orders')
              .update({ payment_status: 'refunded' })
              .eq('id', orderId)
          } else {
            await supabaseAdmin
              .from('orders')
              .update({ payment_status: 'refunded', order_status: 'cancelled' })
              .eq('id', orderId)
          }
        }

        return { success: true, transactionId: refundTransactionId }
      } catch (refundError: any) {
        logPayment(LogLevel.ERROR, 'Refund via original payment method failed', {
          orderId,
          refundId,
          paymentMethod: order.payment_method,
          error: refundError.message || 'Unknown error',
        })
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

      // Check if this is a partial refund
      const orderTotal = parseFloat(String(order.total_amount || 0))
      const isPartialRefund = amount < orderTotal - 0.01

      // Update refund record
      await supabaseAdmin
        .from('order_refunds')
        .update({
          status: 'completed',
          refunded_at: new Date().toISOString(),
          refund_method: 'platform_refund',
        })
        .eq('id', refundId)

      // Update order status based on refund type
      if (isPartialRefund) {
        // Partial refund: update payment transaction status
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            status: 'partially_refunded',
            refunded_at: new Date().toISOString(),
          })
          .eq('related_id', orderId)
          .eq('type', 'order')
          .eq('status', 'paid')

        await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'partially_refunded',
            // Don't cancel order for partial refund
          })
          .eq('id', orderId)
      } else {
        // Full refund: update payment_transactions, then atomically cancel order and restore stock
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            status: 'refunded',
            refunded_at: new Date().toISOString(),
          })
          .eq('related_id', orderId)
          .eq('type', 'order')
          .eq('status', 'paid')

        // Only restore stock when order is not yet shipped/completed (RPC rejects those)
        const canRestoreStock = order.order_status !== 'shipped' && order.order_status !== 'completed'
        if (canRestoreStock) {
          const { data: cancelResult, error: cancelError } = await supabaseAdmin
            .rpc('cancel_order_and_restore_stock', { p_order_id: orderId })
          if (cancelError || !cancelResult?.[0]?.success) {
            logPayment(LogLevel.ERROR, 'cancel_order_and_restore_stock failed after platform full refund', {
              orderId,
              error: cancelError?.message ?? cancelResult?.[0]?.error_message ?? 'unknown',
            })
            return { success: false, error: cancelResult?.[0]?.error_message ?? cancelError?.message ?? 'Failed to restore stock' }
          }
          await supabaseAdmin
            .from('orders')
            .update({ payment_status: 'refunded' })
            .eq('id', orderId)
        } else {
          await supabaseAdmin
            .from('orders')
            .update({ payment_status: 'refunded', order_status: 'cancelled' })
            .eq('id', orderId)
        }
      }

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
    logPayment(LogLevel.ERROR, 'processRefund error', {
      orderId,
      refundId,
      error: error.message || 'Unknown error',
    })
    return { success: false, error: error.message || 'Unknown error' }
  }
}
