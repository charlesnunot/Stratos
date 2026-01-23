import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAlipayRefund } from '@/lib/payments/alipay'

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

    const { orderId, refundAmount, refundReason } = await request.json()

    // Validate required fields
    if (!orderId || !refundAmount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate amount
    const numericAmount = parseFloat(refundAmount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid refund amount' },
        { status: 400 }
      )
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

    // Verify order belongs to user or user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'
    if (order.user_id !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Verify order is paid
    if (order.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Order is not paid' },
        { status: 400 }
      )
    }

    // Verify refund amount doesn't exceed order amount
    if (numericAmount > order.total_amount) {
      return NextResponse.json(
        { error: 'Refund amount exceeds order amount' },
        { status: 400 }
      )
    }

    // Create refund
    const refund = await createAlipayRefund({
      outTradeNo: order.order_number || order.id,
      refundAmount: numericAmount,
      refundReason: refundReason || 'User requested refund',
      outRequestNo: `refund_${order.id}_${Date.now()}`,
    })

    // Update order status
    await supabase
      .from('orders')
      .update({
        payment_status: numericAmount >= order.total_amount ? 'refunded' : 'partially_refunded',
      })
      .eq('id', orderId)

    console.log('Alipay refund created successfully:', refund)
    return NextResponse.json({
      success: true,
      refund,
    })
  } catch (error: any) {
    console.error('Alipay refund error:', {
      message: error.message,
      stack: error.stack,
    })

    return NextResponse.json(
      { error: error.message || 'Failed to create refund' },
      { status: 500 }
    )
  }
}
