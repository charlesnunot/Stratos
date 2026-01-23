import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAlipayOrder } from '@/lib/payments/alipay'

export async function POST(request: NextRequest) {
  try {
    // Payment library will check platform account first, then fallback to env vars

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Authentication error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount, orderId, subject, returnUrl, notifyUrl, metadata } =
      await request.json()

    // Validate required fields
    if (!amount || !orderId || !subject) {
      console.error('Missing required fields:', {
        amount: !!amount,
        orderId: !!orderId,
        subject: !!subject,
      })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate amount
    const numericAmount = parseFloat(amount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      console.error('Invalid amount:', amount)
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    // Get order from database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('Order not found:', orderError)
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Verify order belongs to user
    if (order.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Create Alipay order
    const alipayOrder = await createAlipayOrder({
      outTradeNo: order.order_number || order.id,
      totalAmount: numericAmount,
      subject: subject || `订单 ${order.order_number}`,
      body: `订单号: ${order.order_number}`,
      returnUrl: returnUrl || `${request.nextUrl.origin}/orders/${orderId}`,
      notifyUrl: notifyUrl || `${request.nextUrl.origin}/api/payments/alipay/callback`,
      metadata: {
        orderId: order.id,
        userId: user.id,
        ...metadata,
      },
    })

    // Update order with payment method
    await supabase
      .from('orders')
      .update({
        payment_method: 'alipay',
        payment_status: 'pending',
      })
      .eq('id', orderId)

    console.log('Alipay order created successfully:', alipayOrder.outTradeNo)
    return NextResponse.json({
      orderString: alipayOrder.orderString,
      outTradeNo: alipayOrder.outTradeNo,
    })
  } catch (error: any) {
    console.error('Alipay order creation error:', {
      message: error.message,
      stack: error.stack,
    })

    return NextResponse.json(
      { error: error.message || 'Failed to create Alipay order' },
      { status: 500 }
    )
  }
}
