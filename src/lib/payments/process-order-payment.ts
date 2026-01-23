/**
 * Unified service layer for processing order payments
 * Handles inventory updates, commission calculations, and notifications
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { logPaymentSuccess, logPaymentFailure, logIdempotencyHit } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'

interface ProcessOrderPaymentParams {
  orderId: string
  amount: number
  supabaseAdmin: SupabaseClient
}

export async function processOrderPayment({
  orderId,
  amount,
  supabaseAdmin,
}: ProcessOrderPaymentParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Get order details first (for validation and commission calculation)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('buyer_id, seller_id, affiliate_id, product_id, quantity, total_amount, commission_amount, order_items(product_id, quantity, price)')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { success: false, error: `Order not found: ${orderError?.message}` }
    }

    // Verify amount matches
    if (Math.abs(amount - order.total_amount) > 0.01) {
      return { success: false, error: `Amount mismatch: expected ${order.total_amount}, got ${amount}` }
    }

    // Check if order is already paid
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('payment_status')
      .eq('id', orderId)
      .single()

    if (existingOrder?.payment_status === 'paid') {
      // Already processed, return success (idempotency)
      logIdempotencyHit('order', {
        orderId,
        amount,
      })
      return { success: true }
    }

    // Use database transaction function for atomic operations
    const { data: transactionResult, error: transactionError } = await supabaseAdmin
      .rpc('process_order_payment_transaction', {
        p_order_id: orderId,
        p_amount: amount,
        p_paid_at: new Date().toISOString(),
      })

    if (transactionError) {
      return { success: false, error: `Transaction failed: ${transactionError.message}` }
    }

    if (!transactionResult || transactionResult.length === 0) {
      return { success: false, error: 'Transaction function returned no result' }
    }

    const result = transactionResult[0]
    if (!result.success) {
      return { success: false, error: result.error_message || 'Transaction failed' }
    }

    // Calculate and create commissions if affiliate exists
    if (order.affiliate_id) {
      try {
        const { calculateAndCreateCommissions } = await import('@/lib/commissions/calculate')
        await calculateAndCreateCommissions(order, supabaseAdmin)
      } catch (error) {
        console.error('Error calculating commissions:', error)
        // Don't fail the payment if commission calculation fails
      }
    }

    // Get order payment method and currency for transfer and logging
    const { data: orderDetails } = await supabaseAdmin
      .from('orders')
      .select('payment_method, currency, seller_id')
      .eq('id', orderId)
      .single()

    // Get payment transaction ID if available
    const { data: paymentTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('id')
      .eq('related_id', orderId)
      .eq('type', 'order')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Transfer money to seller (if payment method supports automatic transfer)
    if (orderDetails?.seller_id && orderDetails?.payment_method && orderDetails?.payment_method !== 'bank') {
      try {
        const { transferToSeller } = await import('@/lib/payments/transfer-to-seller')
        const transferResult = await transferToSeller({
          sellerId: orderDetails.seller_id,
          amount: order.total_amount,
          currency: orderDetails.currency || 'USD',
          paymentTransactionId: paymentTransaction?.id,
          paymentMethod: orderDetails.payment_method as any,
          orderId,
          supabaseAdmin,
        })

        if (!transferResult.success) {
          // If transfer failed and is not retryable, create compensation record
          if (!transferResult.retryable) {
            try {
              const { createCompensationRecord } = await import('@/lib/payments/compensation')
              await createCompensationRecord(
                orderId,
                transferResult.transferId || '',
                transferResult.error || 'Transfer failed after max retries',
                supabaseAdmin
              )
            } catch (compError) {
              console.error('Failed to create compensation record:', compError)
            }
          }
        }
      } catch (error) {
        console.error('Error transferring to seller:', error)
        // Don't fail the payment if transfer fails
      }
    }

    // Create notification
    await supabaseAdmin.from('notifications').insert({
      user_id: order.buyer_id,
      type: 'order',
      title: '订单支付成功',
      content: `您的订单已成功支付`,
      related_id: orderId,
      related_type: 'order',
      link: `/orders/${orderId}`,
    })

    // Notify seller of new order
    if (order.seller_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: order.seller_id,
        type: 'order',
        title: '新订单',
        content: `您收到了一个新订单`,
        related_id: orderId,
        related_type: 'order',
        link: `/seller/orders/${orderId}`,
      })
    }

    logPaymentSuccess('order', {
      orderId,
      userId: order.buyer_id,
      amount: order.total_amount,
      currency: orderDetails?.currency || 'USD',
      paymentMethod: orderDetails?.payment_method || 'unknown',
    })

    return { success: true }
  } catch (error: any) {
    const paymentError = createPaymentError(error, {
      orderId,
      amount,
    })
    logPaymentError(paymentError)
    return { success: false, error: paymentError.userMessage }
  }
}
