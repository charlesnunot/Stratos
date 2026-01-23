import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { checkSellerDepositRequirement } from '@/lib/deposits/check-deposit-requirement'
import { disableSellerPayment } from '@/lib/deposits/payment-control'

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

    const { orderId, successUrl, cancelUrl } = await request.json()

    // Validate required fields
    if (!orderId || !successUrl || !cancelUrl) {
      console.error('Missing required fields:', {
        orderId: !!orderId,
        successUrl: !!successUrl,
        cancelUrl: !!cancelUrl,
      })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate URLs
    try {
      new URL(successUrl)
      new URL(cancelUrl)
    } catch (urlError) {
      console.error('Invalid URLs:', { successUrl, cancelUrl })
      return NextResponse.json(
        { error: 'Invalid success or cancel URL' },
        { status: 400 }
      )
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total_amount, order_number')
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

    // Check if order is already paid
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('payment_status, seller_id, total_amount, currency')
      .eq('id', orderId)
      .single()

    if (existingOrder?.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Order already paid' },
        { status: 400 }
      )
    }

    // Double-check deposit requirement before payment (concurrency protection)
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

    if (existingOrder?.seller_id && existingOrder?.total_amount) {
      const depositCheck = await checkSellerDepositRequirement(
        existingOrder.seller_id,
        existingOrder.total_amount,
        supabaseAdmin
      )

      if (depositCheck.requiresDeposit) {
        // Disable seller payment immediately
        await disableSellerPayment(
          existingOrder.seller_id,
          'deposit_required',
          supabaseAdmin
        )

        return NextResponse.json(
          {
            error: 'Deposit required',
            requiresDeposit: true,
            requiredAmount: depositCheck.requiredAmount,
            currentTier: depositCheck.currentTier,
            suggestedTier: depositCheck.suggestedTier,
            reason: depositCheck.reason,
          },
          { status: 403 }
        )
      }
    }

    // Create checkout session
    console.log('Creating Stripe checkout session for order:', orderId)
    const session = await createCheckoutSession(
      order.total_amount,
      successUrl,
      cancelUrl,
      {
        userId: user.id,
        orderId: orderId,
        type: 'order',
      },
      existingOrder?.currency || 'usd'
    )

    if (!session || !session.url) {
      console.error('Failed to create checkout session: no URL returned')
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    console.log('Checkout session created successfully:', session.id)
    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error: any) {
    console.error('Stripe checkout session error:', {
      message: error.message,
      type: error.type,
      code: error.code,
      stack: error.stack,
    })
    
    // Provide more specific error messages
    if (error.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: 'Invalid payment request: ' + (error.message || 'Unknown error') },
        { status: 400 }
      )
    }
    
    if (error.type === 'StripeAPIError') {
      return NextResponse.json(
        { error: 'Payment service error: ' + (error.message || 'Unknown error') },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
