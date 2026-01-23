import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
})

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

    // Check if user has permission
    if (order.buyer_id !== user.id && order.seller_id !== user.id) {
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
    if (order.payment_status === 'paid' && order.payment_method === 'stripe') {
      // Get payment intent ID from order (need to select it)
      const { data: orderWithPayment } = await supabase
        .from('orders')
        .select('payment_intent_id')
        .eq('id', orderId)
        .single()

      // Try to get payment_intent_id, but if column doesn't exist yet, skip refund
      const paymentIntentId = orderWithPayment?.payment_intent_id

      if (paymentIntentId) {
        try {
          // Create refund
          const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: Math.round(order.total_amount * 100), // Convert to cents
          })

          // Update order with refund info
          await supabase
            .from('orders')
            .update({
              payment_status: 'refunded',
              order_status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId)

          // Create notification for buyer
          await supabase.from('notifications').insert({
            user_id: order.buyer_id,
            type: 'order',
            title: '订单已取消并退款',
            content: `订单 ${order.order_number} 已取消，退款金额 ¥${order.total_amount.toFixed(2)} 将退回您的账户`,
            related_id: orderId,
            related_type: 'order',
          })

          // Create notification for seller
          await supabase.from('notifications').insert({
            user_id: order.seller_id,
            type: 'order',
            title: '订单已取消',
            content: `订单 ${order.order_number} 已被买家取消`,
            related_id: orderId,
            related_type: 'order',
          })

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

    // For unpaid orders or non-Stripe payments, just cancel
    await supabase
      .from('orders')
      .update({
        order_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    // Restore stock
    const { data: product } = await supabase
      .from('products')
      .select('stock')
      .eq('id', order.product_id)
      .single()

    if (product) {
      await supabase
        .from('products')
        .update({
          stock: (product.stock || 0) + order.quantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.product_id)
    }

    // Create notifications
    await supabase.from('notifications').insert({
      user_id: order.buyer_id,
      type: 'order',
      title: '订单已取消',
      content: `订单 ${order.order_number} 已取消`,
      related_id: orderId,
      related_type: 'order',
      link: `/orders/${orderId}`,
    })

    if (order.seller_id !== order.buyer_id) {
      await supabase.from('notifications').insert({
        user_id: order.seller_id,
        type: 'order',
        title: '订单已取消',
        content: `订单 ${order.order_number} 已被买家取消`,
        related_id: orderId,
        related_type: 'order',
        link: `/orders/${orderId}`,
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
