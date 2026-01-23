import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWeChatPayOrder } from '@/lib/payments/wechat'

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

    const { orderId, amount, description, notifyUrl } = await request.json()

    // Validate required fields
    if (!orderId || !amount || !description) {
      console.error('Missing required fields:', {
        orderId: !!orderId,
        amount: !!amount,
        description: !!description,
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

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total_amount')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Verify order belongs to user
    const { data: orderOwner } = await supabase
      .from('orders')
      .select('buyer_id')
      .eq('id', orderId)
      .single()

    if (orderOwner?.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Get client IP
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     '127.0.0.1'

    // Create WeChat Pay order
    const wechatOrder = await createWeChatPayOrder({
      outTradeNo: order.order_number || order.id,
      totalAmount: numericAmount,
      description: description || `订单 ${order.order_number}`,
      notifyUrl: notifyUrl || `${request.nextUrl.origin}/api/payments/wechat/notify`,
      clientIp,
    })

    if (wechatOrder.returnCode !== 'SUCCESS' || wechatOrder.resultCode !== 'SUCCESS') {
      return NextResponse.json(
        { error: wechatOrder.errCodeDes || wechatOrder.returnMsg || 'Failed to create WeChat Pay order' },
        { status: 400 }
      )
    }

    if (!wechatOrder.codeUrl) {
      return NextResponse.json(
        { error: 'No code URL returned from WeChat Pay' },
        { status: 500 }
      )
    }

    // Create payment transaction record
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

    await supabaseAdmin.from('payment_transactions').insert({
      type: 'order',
      provider: 'wechat',
      provider_ref: wechatOrder.prepayId || order.order_number,
      amount: numericAmount,
      currency: 'CNY',
      status: 'pending',
      related_id: orderId,
      metadata: {
        prepayId: wechatOrder.prepayId,
        outTradeNo: order.order_number || order.id,
      },
    })

    // Update order with payment method
    await supabase
      .from('orders')
      .update({
        payment_method: 'wechat',
        payment_status: 'pending',
      })
      .eq('id', orderId)

    console.log('WeChat Pay order created successfully:', wechatOrder.prepayId)
    return NextResponse.json({
      codeUrl: wechatOrder.codeUrl,
      prepayId: wechatOrder.prepayId,
    })
  } catch (error: any) {
    console.error('WeChat Pay order creation error:', {
      message: error.message,
      stack: error.stack,
    })

    return NextResponse.json(
      { error: error.message || 'Failed to create WeChat Pay order' },
      { status: 500 }
    )
  }
}
