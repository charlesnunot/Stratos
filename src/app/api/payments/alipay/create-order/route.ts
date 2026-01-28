import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAlipayOrder } from '@/lib/payments/alipay'
import { validateSellerPaymentReady } from '@/lib/payments/validate-seller-payment-ready'

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
      .select('payment_status, seller_id, total_amount, currency, shipping_address, buyer_id, order_number')
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
    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Check if order is already paid
    if (order.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Order already paid' },
        { status: 400 }
      )
    }

    // Validate shipping address
    if (!order.shipping_address) {
      return NextResponse.json(
        { error: 'Shipping address is required. Please fill in the shipping information before payment.' },
        { status: 400 }
      )
    }

    // Validate shipping address completeness
    const shippingAddress = order.shipping_address as any
    if (!shippingAddress.recipientName || !shippingAddress.phone || !shippingAddress.address || !shippingAddress.country) {
      return NextResponse.json(
        { error: 'Shipping address is incomplete. Please fill in all required fields (name, phone, address, country).' },
        { status: 400 }
      )
    }

    // Get Supabase admin client
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

    // ============================================
    // SECOND CHECK: Validate seller payment readiness before creating payment session
    // This is the final defense line - more critical than first check
    // ============================================
    if (order.seller_id) {
      const validationResult = await validateSellerPaymentReady({
        sellerId: order.seller_id,
        supabaseAdmin,
        paymentMethod: 'alipay', // Validate that seller supports Alipay payment
      })

      if (!validationResult.canAcceptPayment) {
        // UX Boundary: Second check failure = order exists but cannot pay
        console.warn('[alipay/create-order] Second check failed:', {
          orderId,
          sellerId: order.seller_id,
          reason: validationResult.reason,
          eligibility: validationResult.eligibility,
        })

        return NextResponse.json(
          {
            error: 'Payment cannot be processed at this time',
            reason: validationResult.reason || 'Seller payment account is not ready',
            eligibility: validationResult.eligibility,
            canRetry: true, // Allow retry (temporary state issue)
            message: 'This is a temporary state issue. Please try again later or contact support if the problem persists.',
          },
          { status: 403 }
        )
      }
    }

    // Create Alipay order FIRST (before deposit check)
    const alipayOrder = await createAlipayOrder({
      outTradeNo: order.order_number || orderId,
      totalAmount: numericAmount,
      subject: subject || `订单 ${order.order_number}`,
      body: `订单号: ${order.order_number}`,
      returnUrl: returnUrl || `${request.nextUrl.origin}/orders/${orderId}`,
      notifyUrl: notifyUrl || `${request.nextUrl.origin}/api/payments/alipay/callback`,
      metadata: {
        orderId: orderId,
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

    // NOW check deposit requirement AFTER payment session creation
    if (order.seller_id && order.total_amount) {
      // Call database function that handles deposit check + side-effects atomically
      const { data: depositResult, error: depositError } = await supabaseAdmin.rpc(
        'check_deposit_and_execute_side_effects',
        {
          p_seller_id: order.seller_id,
          p_order_id: orderId,
          p_order_amount: order.total_amount,
          p_payment_provider: 'alipay',
          p_payment_session_id: alipayOrder.outTradeNo, // Use Alipay trade number as session ID
        }
      )

      if (depositError) {
        console.error('Error checking deposit requirement:', depositError)
        // Continue with payment even if deposit check fails (fail open)
      } else if (depositResult && depositResult.length > 0 && depositResult[0].requires_deposit) {
        const depositCheck = depositResult[0]

        // DO NOT return orderString - "create but not expose" strategy
        return NextResponse.json(
          {
            error: '订单暂时无法支付，请联系卖家',
            requiresDeposit: true,
            sellerId: order.seller_id,
            requiredAmount: parseFloat(depositCheck.required_amount?.toString() || '0'),
            currentTier: parseFloat(depositCheck.current_tier?.toString() || '0'),
            suggestedTier: parseFloat(depositCheck.suggested_tier?.toString() || '0'),
            reason: depositCheck.reason || 'Deposit required',
          },
          { status: 403 }
        )
      }
    }

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
