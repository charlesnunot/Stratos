/**
 * Unified service layer for processing order payments
 * Handles inventory updates, commission calculations, and notifications
 * 
 * 审计日志规范：
 * - 记录订单支付处理操作
 * - 记录库存扣减、佣金计算、通知发送
 * - 不记录敏感支付信息（卡号、密钥等）
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { logPaymentSuccess, logPaymentFailure, logIdempotencyHit, logPayment, LogLevel } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'
import { logAudit } from '@/lib/api/audit'

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
      .select('id, buyer_id, seller_id, affiliate_id, affiliate_post_id, product_id, quantity, total_amount, commission_amount, order_items(product_id, quantity, price)')
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

    // Get order details to check if it's a child order (has parent_order_id)
    const { data: orderDetails, error: orderDetailsError } = await supabaseAdmin
      .from('orders')
      .select('id, parent_order_id, seller_payment_status')
      .eq('id', orderId)
      .single()

    if (orderDetailsError || !orderDetails) {
      return { success: false, error: `Failed to fetch order details: ${orderDetailsError?.message || 'Order not found'}` }
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

    // Update child order's seller_payment_status if it's a child order
    if (orderDetails.parent_order_id) {
      const { error: updateChildOrderError } = await supabaseAdmin
        .from('orders')
        .update({ seller_payment_status: 'paid' })
        .eq('id', orderId)

      if (updateChildOrderError) {
        logPayment(LogLevel.ERROR, 'Failed to update child order payment status', {
          orderId,
          childOrderId: orderId,
          error: updateChildOrderError.message || 'Unknown error',
        })
        // Don't fail the payment, but log the error
      } else {
        // Trigger parent order status update via database function
        // The trigger will automatically call update_order_group_payment_status
        // But we can also call it explicitly to ensure it runs
        const { error: updateParentError } = await supabaseAdmin
          .rpc('update_order_group_payment_status', {
            p_order_group_id: orderDetails.parent_order_id,
          })

        if (updateParentError) {
          logPayment(LogLevel.ERROR, 'Failed to update parent order status', {
            orderId,
            parentOrderId: orderDetails.parent_order_id,
            error: updateParentError.message || 'Unknown error',
          })
          // Don't fail the payment, but log the error
        }
      }
    }

    // Calculate and create commissions if affiliate exists
    if (order.affiliate_id) {
      try {
        const { calculateAndCreateCommissions } = await import('@/lib/commissions/calculate')
        await calculateAndCreateCommissions(order, supabaseAdmin)
      } catch (error: any) {
        logPayment(LogLevel.ERROR, 'Error calculating commissions', {
          orderId,
          affiliateId: order.affiliate_id,
          error: error.message || 'Unknown error',
        })
        // Don't fail the payment if commission calculation fails
      }
    }

    // Get order payment method and currency for transfer and logging
    const { data: orderPaymentInfo } = await supabaseAdmin
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

    // ============================================
    // Direct Payment Model: No transfer needed
    // ============================================
    // In the new model, buyer pays directly to seller via Stripe Connect destination charges
    // Platform does not handle funds, so no transfer is needed
    // Funds go directly from buyer to seller's Stripe Connect account
    // Platform only records the transaction for accounting purposes
    
    // Note: For other payment methods (PayPal, Alipay, WeChat), similar direct payment
    // mechanisms should be used. Bank transfers still require manual processing.

    // Create notification (use content_key for i18n, title/content as fallback)
    const { error: notifBuyerError } = await supabaseAdmin.from('notifications').insert({
      user_id: order.buyer_id,
      type: 'order',
      title: 'Order Payment Successful', // English fallback
      content: `Your order has been paid successfully`,
      related_id: orderId,
      related_type: 'order',
      link: `/orders/${orderId}`,
      content_key: 'order_paid',
      content_params: { orderId: orderId.substring(0, 8) + '...' },
    })
    if (notifBuyerError) {
      console.error('[process-order-payment] Buyer notification insert failed:', notifBuyerError.message)
    } else {
      logAudit({
        action: 'send_notification',
        userId: order.buyer_id,
        resourceId: orderId,
        resourceType: 'order',
        result: 'success',
        timestamp: new Date().toISOString(),
        meta: { notificationType: 'order_paid', recipient: 'buyer' },
      })
    }

    // Notify seller of new order
    if (order.seller_id) {
      const { error: notifSellerError } = await supabaseAdmin.from('notifications').insert({
        user_id: order.seller_id,
        type: 'order',
        title: 'New Order Received', // English fallback
        content: `You have received a new paid order`,
        related_id: orderId,
        related_type: 'order',
        link: `/seller/orders/${orderId}`,
        content_key: 'seller_new_order',
        content_params: { orderId: orderId.substring(0, 8) + '...' },
      })
      if (notifSellerError) {
        console.error('[process-order-payment] Seller notification insert failed:', notifSellerError.message)
      } else {
        logAudit({
          action: 'send_notification',
          userId: order.seller_id,
          resourceId: orderId,
          resourceType: 'order',
          result: 'success',
          timestamp: new Date().toISOString(),
          meta: { notificationType: 'seller_new_order', recipient: 'seller' },
        })
      }
    }

    logPaymentSuccess('order', {
      orderId,
      userId: order.buyer_id,
      amount: order.total_amount,
      currency: orderPaymentInfo?.currency || 'USD',
      paymentMethod: orderPaymentInfo?.payment_method || 'unknown',
    })

    // 记录订单支付处理完成审计日志
    logAudit({
      action: 'process_order_payment',
      userId: order.buyer_id,
      resourceId: orderId,
      resourceType: 'order',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        sellerId: order.seller_id?.substring(0, 8) + '...',
        hasAffiliate: !!order.affiliate_id,
        paymentMethod: orderPaymentInfo?.payment_method || 'unknown',
      },
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
