import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import Stripe from 'stripe'
import { checkAutoRecovery } from '@/lib/deposits/payment-control'

async function getStripeClient() {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(stripeKey, {
    apiVersion: '2025-12-15.clover',
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Check if user has permission: buyer, seller, or admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'
    const isBuyer = order.buyer_id === user.id
    const isSeller = order.seller_id === user.id

    if (!isBuyer && !isSeller && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if order can be cancelled
    if (order.order_status === 'cancelled') {
      return NextResponse.json(
        { error: 'Order already cancelled' },
        { status: 400 }
      )
    }

    if (order.order_status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot cancel completed order' },
        { status: 400 }
      )
    }

    if (order.order_status === 'shipped') {
      return NextResponse.json(
        { error: 'Cannot cancel shipped order. Please contact support for refund.' },
        { status: 400 }
      )
    }

    // Handle refund if payment was made
    if (order.payment_status === 'paid') {
      // Use unified refund processing for supported payment methods
      const supportedMethods = ['stripe', 'alipay']
      
      if (order.payment_method && supportedMethods.includes(order.payment_method)) {
        // Get admin client for refund processing
        const supabaseAdminForRefund = await getSupabaseAdmin()

        // Create refund record first
        const { data: refundRecord, error: refundRecordError } = await supabaseAdminForRefund
          .from('order_refunds')
          .insert({
            order_id: orderId,
            refund_amount: order.total_amount,
            currency: order.currency || 'USD',
            refund_reason: 'Order cancellation by buyer',
            refund_method: 'original_payment',
            status: 'pending',
          })
          .select()
          .single()

        if (refundRecordError) {
          console.error('Failed to create refund record:', refundRecordError)
        } else {
          // Process refund using unified service
          const { processRefund } = await import('@/lib/payments/process-refund')
          const refundResult = await processRefund({
            orderId,
            refundId: refundRecord.id,
            amount: order.total_amount,
            currency: order.currency || 'USD',
            refundMethod: 'original_payment',
            supabaseAdmin: supabaseAdminForRefund,
          })

          if (refundResult.success) {
            // Update order status to cancelled (refund already processed)
            // Use database function to restore stock atomically
            const supabaseAdminForCancel = await getSupabaseAdmin()
            
            // Call atomic database function to cancel order and restore stock
            const { data: cancelResult, error: cancelError } = await supabaseAdminForCancel
              .rpc('cancel_order_and_restore_stock', {
                p_order_id: orderId,
              })

            if (cancelError) {
              console.error('Error cancelling order after refund:', cancelError)
              // Continue anyway, refund is already processed
            } else if (cancelResult && cancelResult.length > 0 && !cancelResult[0].success) {
              console.error('Order cancellation failed:', cancelResult[0].error_message)
              // Continue anyway, refund is already processed
            }

            // Update payment status separately (database function only updates order_status)
            await supabaseAdminForCancel
              .from('orders')
              .update({
                payment_status: 'refunded',
                updated_at: new Date().toISOString(),
              })
              .eq('id', orderId)

            // Create notifications (use admin client)
            await supabaseAdminForCancel.from('notifications').insert({
              user_id: order.buyer_id,
              type: 'order',
              title: '订单已取消并退款',
              content: `订单 ${order.order_number} 已取消，退款金额 ¥${order.total_amount.toFixed(2)} 将退回您的账户`,
              related_id: orderId,
              related_type: 'order',
              link: `/orders/${orderId}`,
            })

            await supabaseAdminForCancel.from('notifications').insert({
              user_id: order.seller_id,
              type: 'order',
              title: '订单已取消',
              content: `订单 ${order.order_number} 已被买家取消`,
              related_id: orderId,
              related_type: 'order',
              link: `/orders/${orderId}`,
            })

    // Check and recover seller payment if unfilled orders drop below tier
    // Get all affected sellers (for multi-product orders)
    const sellerIds = new Set<string>()
    if (order.seller_id) {
      sellerIds.add(order.seller_id)
    }
    // Also check order_items for multi-product orders
    const { data: orderItemsForSellers } = await supabaseAdminForCancel
      .from('order_items')
      .select('product_id, products!inner(seller_id)')
      .eq('order_id', orderId)

    if (orderItemsForSellers && orderItemsForSellers.length > 0) {
      orderItemsForSellers.forEach((item: any) => {
        if (item.products?.seller_id) {
          sellerIds.add(item.products.seller_id)
        }
      })
    }

    // Check auto-recovery for each affected seller (async, non-blocking)
    for (const sellerId of sellerIds) {
      checkAutoRecovery(sellerId, supabaseAdminForCancel).catch((error) => {
        console.error(`[cancel] Auto-recovery check failed for seller ${sellerId}:`, error)
      })
    }

            return NextResponse.json({
              success: true,
              refundId: refundRecord.id,
              message: 'Order cancelled and refunded successfully',
            })
          } else {
            // Refund processing failed, but still cancel the order
            // The refund record will remain in pending status for manual processing
            console.error('Refund processing failed:', refundResult.error)
            // Continue to cancel order without refund
          }
        }
      } else if (order.payment_method === 'stripe') {
        // Legacy Stripe refund handling (for backward compatibility)
        const supabaseAdminForCancel = await getSupabaseAdmin()
        const { data: orderWithPayment } = await supabaseAdminForCancel
          .from('orders')
          .select('payment_intent_id')
          .eq('id', orderId)
          .single()

        const paymentIntentId = orderWithPayment?.payment_intent_id

        if (paymentIntentId) {
          try {
            const stripe = await getStripeClient()
            const refund = await stripe.refunds.create({
              payment_intent: paymentIntentId,
              amount: Math.round(order.total_amount * 100),
            })

            // Update order status to cancelled (refund already processed by Stripe)
            // Use database function to restore stock atomically
            const { data: cancelResult, error: cancelError } = await supabaseAdminForCancel
              .rpc('cancel_order_and_restore_stock', {
                p_order_id: orderId,
              })

            if (cancelError) {
              console.error('Error cancelling order after refund:', cancelError)
              // Continue anyway, refund is already processed
            } else if (cancelResult && cancelResult.length > 0 && !cancelResult[0].success) {
              console.error('Order cancellation failed:', cancelResult[0].error_message)
              // Continue anyway, refund is already processed
            }

            // Update payment status separately (database function only updates order_status)
            await supabaseAdminForCancel
              .from('orders')
              .update({
                payment_status: 'refunded',
                updated_at: new Date().toISOString(),
              })
              .eq('id', orderId)

            await supabaseAdminForCancel.from('notifications').insert({
              user_id: order.buyer_id,
              type: 'order',
              title: '订单已取消并退款',
              content: `订单 ${order.order_number} 已取消，退款金额 ¥${order.total_amount.toFixed(2)} 将退回您的账户`,
              related_id: orderId,
              related_type: 'order',
              link: `/orders/${orderId}`,
            })

            await supabaseAdminForCancel.from('notifications').insert({
              user_id: order.seller_id,
              type: 'order',
              title: '订单已取消',
              content: `订单 ${order.order_number} 已被买家取消`,
              related_id: orderId,
              related_type: 'order',
              link: `/orders/${orderId}`,
            })

            // Check and recover seller payment if unfilled orders drop below tier
            if (order.seller_id) {
              checkAutoRecovery(order.seller_id, supabaseAdminForCancel).catch((error) => {
                console.error(`[cancel] Auto-recovery check failed for seller ${order.seller_id}:`, error)
              })
            }

            return NextResponse.json({
              success: true,
              refundId: refund.id,
              message: 'Order cancelled and refunded successfully',
            })
          } catch (stripeError: any) {
            console.error('Stripe refund error:', stripeError)
            return NextResponse.json(
              { error: `Refund failed: ${stripeError.message}` },
              { status: 500 }
            )
          }
        }
      }
    }

    // For unpaid orders or non-Stripe payments, just cancel
    // Use database function for atomic cancellation and stock restoration
    const supabaseAdminForCancel = await getSupabaseAdmin()
    
    // Call atomic database function
    const { data: cancelResult, error: cancelError } = await supabaseAdminForCancel
      .rpc('cancel_order_and_restore_stock', {
        p_order_id: orderId,
      })

    if (cancelError) {
      console.error('Error cancelling order:', cancelError)
      return NextResponse.json(
        { error: `Failed to cancel order: ${cancelError.message}` },
        { status: 500 }
      )
    }

    if (!cancelResult || cancelResult.length === 0) {
      return NextResponse.json(
        { error: 'Order cancellation function returned no result' },
        { status: 500 }
      )
    }

    const result = cancelResult[0]
    if (!result.success) {
      return NextResponse.json(
        { error: result.error_message || 'Failed to cancel order' },
        { status: 400 }
      )
    }

    // Create notifications
    await supabaseAdminForCancel.from('notifications').insert({
      user_id: order.buyer_id,
      type: 'order',
      title: '订单已取消',
      content: `订单 ${order.order_number} 已取消`,
      related_id: orderId,
      related_type: 'order',
      link: `/orders/${orderId}`,
    })

    if (order.seller_id !== order.buyer_id) {
      await supabaseAdminForCancel.from('notifications').insert({
        user_id: order.seller_id,
        type: 'order',
        title: '订单已取消',
        content: `订单 ${order.order_number} 已被买家取消`,
        related_id: orderId,
        related_type: 'order',
        link: `/orders/${orderId}`,
      })
    }

    // Check and recover seller payment if unfilled orders drop below tier
    // Get all affected sellers (for multi-product orders)

    const sellerIds = new Set<string>()
    if (order.seller_id) {
      sellerIds.add(order.seller_id)
    }
    // Also check order_items for multi-product orders
    const { data: orderItemsForSellers } = await supabaseAdminForCancel
      .from('order_items')
      .select('product_id, products!inner(seller_id)')
      .eq('order_id', orderId)

    if (orderItemsForSellers && orderItemsForSellers.length > 0) {
      orderItemsForSellers.forEach((item: any) => {
        if (item.products?.seller_id) {
          sellerIds.add(item.products.seller_id)
        }
      })
    }

    // Check auto-recovery for each affected seller (async, non-blocking)
    for (const sellerId of sellerIds) {
      checkAutoRecovery(sellerId, supabaseAdminForCancel).catch((error) => {
        console.error(`[cancel] Auto-recovery check failed for seller ${sellerId}:`, error)
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully',
    })
  } catch (error: any) {
    console.error('Cancel order error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel order' },
      { status: 500 }
    )
  }
}
