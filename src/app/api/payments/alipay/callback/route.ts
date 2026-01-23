import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAlipayCallback, type AlipayCallbackParams } from '@/lib/payments/alipay'

export async function POST(request: NextRequest) {
  try {
    // Alipay sends form-urlencoded data, not JSON
    const formData = await request.formData()
    const params: AlipayCallbackParams = {
      out_trade_no: formData.get('out_trade_no')?.toString() || '',
      trade_no: formData.get('trade_no')?.toString() || '',
      trade_status: formData.get('trade_status')?.toString() || '',
      total_amount: formData.get('total_amount')?.toString() || '',
      sign: formData.get('sign')?.toString() || '',
    }
    
    // Add any other fields that might be present
    for (const [key, value] of formData.entries()) {
      if (!params[key as keyof AlipayCallbackParams]) {
        params[key] = value.toString()
      }
    }

    // Verify callback signature
    const isValid = await verifyAlipayCallback(params)
    if (!isValid) {
      console.error('Invalid Alipay callback signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    const { out_trade_no, trade_no, trade_status, total_amount } = params

    // Verify trade status
    if (trade_status !== 'TRADE_SUCCESS' && trade_status !== 'TRADE_FINISHED') {
      console.log('Alipay trade not completed:', trade_status)
      return NextResponse.json({ success: true }) // Acknowledge but don't process
    }

    // Use service role client for admin operations
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const supabase = await createClient()

    // Find order by order number
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', out_trade_no)
      .single()

    if (orderError || !order) {
      console.error('Order not found for Alipay callback:', out_trade_no)
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Check idempotency: Look for existing payment transaction
    const { data: existingTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, status')
      .eq('provider', 'alipay')
      .eq('provider_ref', trade_no)
      .single()

    if (existingTransaction) {
      if (existingTransaction.status === 'paid') {
        // Already processed, return success (idempotency)
        console.log('Alipay payment already processed:', trade_no)
        return NextResponse.json({ success: true })
      }
      // Update existing transaction
      await supabaseAdmin
        .from('payment_transactions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', existingTransaction.id)
    } else {
      // Verify amount
      const paidAmount = parseFloat(total_amount)
      if (Math.abs(paidAmount - order.total_amount) > 0.01) {
        console.error('Amount mismatch:', { paidAmount, orderAmount: order.total_amount })
        return NextResponse.json(
          { error: 'Amount mismatch' },
          { status: 400 }
        )
      }

      // Create new payment transaction record
      await supabaseAdmin.from('payment_transactions').insert({
        type: 'order',
        provider: 'alipay',
        provider_ref: trade_no,
        amount: paidAmount,
        currency: 'CNY',
        status: 'paid',
        related_id: order.id,
        paid_at: new Date().toISOString(),
        metadata: { out_trade_no, trade_no, trade_status },
      })
    }

    // Check if order is already paid
    if (order.payment_status === 'paid') {
      console.log('Order already paid:', order.id)
      return NextResponse.json({ success: true })
    }

    // Use unified service layer to process order payment
    const paidAmount = parseFloat(total_amount)
    const { processOrderPayment } = await import('@/lib/payments/process-order-payment')
    const result = await processOrderPayment({
      orderId: order.id,
      amount: paidAmount,
      supabaseAdmin,
    })

    if (!result.success) {
      console.error('Failed to process order payment:', result.error)
    }

    // Update order with payment method and trade_no
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_method: 'alipay',
        payment_intent_id: trade_no,
      })
      .eq('id', order.id)

    if (updateError) {
      console.error('Failed to update order:', updateError)
      // Don't return error, payment was already processed
    }

    console.log('Alipay payment processed successfully:', {
      orderId: order.id,
      tradeNo: trade_no,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Alipay callback error:', {
      message: error.message,
      stack: error.stack,
    })

    return NextResponse.json(
      { error: error.message || 'Failed to process callback' },
      { status: 500 }
    )
  }
}

// Also handle GET requests (for return URL redirects)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const params: AlipayCallbackParams = {
    out_trade_no: searchParams.get('out_trade_no') || '',
    trade_no: searchParams.get('trade_no') || '',
    trade_status: searchParams.get('trade_status') || '',
    total_amount: searchParams.get('total_amount') || '',
  }

  // Process similar to POST
  try {
    const isValid = await verifyAlipayCallback(params)
    if (!isValid) {
      return NextResponse.redirect(new URL('/orders?error=invalid_signature', request.url))
    }

    if (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED') {
      const supabase = await createClient()
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', params.out_trade_no)
        .single()

      if (order) {
        return NextResponse.redirect(new URL(`/orders/${order.id}`, request.url))
      }
    }

    return NextResponse.redirect(new URL('/orders', request.url))
  } catch (error) {
    console.error('Alipay GET callback error:', error)
    return NextResponse.redirect(new URL('/orders?error=processing_failed', request.url))
  }
}
