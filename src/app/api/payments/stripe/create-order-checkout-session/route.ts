import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { checkSellerDepositRequirement } from '@/lib/deposits/check-deposit-requirement'
import { disableSellerPayment } from '@/lib/deposits/payment-control'
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
      .select('payment_status, seller_id, total_amount, currency, shipping_address, order_number')
      .eq('id', orderId)
      .single()

    if (existingOrder?.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Order already paid' },
        { status: 400 }
      )
    }

    // Validate shipping address
    if (!existingOrder?.shipping_address) {
      return NextResponse.json(
        { error: 'Shipping address is required. Please fill in the shipping information before payment.' },
        { status: 400 }
      )
    }

    // Validate shipping address completeness
    const shippingAddress = existingOrder.shipping_address as any
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
    if (!existingOrder?.seller_id) {
      return NextResponse.json(
        {
          error: 'Order seller not found',
          reason: 'Order does not have a seller_id',
          canRetry: false,
        },
        { status: 400 }
      )
    }

    const validationResult = await validateSellerPaymentReady({
      sellerId: existingOrder.seller_id,
      supabaseAdmin,
      paymentMethod: 'stripe', // Validate that seller supports Stripe payment
    })

    if (!validationResult.canAcceptPayment) {
      // UX Boundary: Second check failure = order exists but cannot pay
      // Return 403, order exists but cannot pay, allow "wait and pay"
      console.warn('[stripe/create-order-checkout-session] Second check failed:', {
        orderId,
        sellerId: existingOrder.seller_id,
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

    // Get seller's payment account ID for destination charges
    const { data: sellerProfile } = await supabaseAdmin
      .from('profiles')
      .select('payment_account_id, payment_provider')
      .eq('id', existingOrder.seller_id)
      .single()

    if (!sellerProfile?.payment_account_id) {
      return NextResponse.json(
        {
          error: 'Seller payment account not found',
          reason: 'Seller has not bound a payment account',
          canRetry: false,
        },
        { status: 403 }
      )
    }

    // Store seller account info for later use in checkout session creation
    const sellerAccountId = sellerProfile.payment_account_id
    const sellerPaymentProvider = sellerProfile.payment_provider

    // Only create checkout session if seller uses Stripe
    if (sellerPaymentProvider !== 'stripe') {
      return NextResponse.json(
        {
          error: 'Payment method mismatch',
          reason: `Order payment method is ${sellerPaymentProvider}, but Stripe checkout session was requested`,
          canRetry: false,
        },
        { status: 400 }
      )
    }

    // Create checkout session with destination (buyer pays directly to seller)
    // Platform does not handle funds, no platform revenue
    console.log('Creating Stripe checkout session for order:', orderId, 'with destination:', sellerAccountId)
    const session = await createCheckoutSession(
      order.total_amount,
      successUrl,
      cancelUrl,
      {
        userId: user.id,
        orderId: orderId,
        type: 'order',
      },
      existingOrder?.currency || 'usd',
      sellerAccountId // Destination account for direct payment
    )

    if (!session || !session.url) {
      console.error('Failed to create checkout session: no URL returned')
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    console.log('Checkout session created successfully:', session.id)

    // NOW check deposit requirement AFTER session creation
    // Use database function to ensure atomicity (check + side-effects in one transaction)
    if (existingOrder?.seller_id && existingOrder?.total_amount) {
      // Get order currency and subscription info for diagnostic logging
      const { data: orderDetails } = await supabaseAdmin
        .from('orders')
        .select('currency, total_amount')
        .eq('id', orderId)
        .single()

      const { data: subscriptionInfo } = await supabaseAdmin
        .from('subscriptions')
        .select('subscription_tier, currency')
        .eq('user_id', existingOrder.seller_id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('subscription_tier', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Get unfilled orders for diagnostic logging
      const { data: unfilledOrders } = await supabaseAdmin
        .from('orders')
        .select('total_amount, currency, payment_status, order_status')
        .eq('seller_id', existingOrder.seller_id)
        .eq('payment_status', 'paid')
        .in('order_status', ['pending', 'paid', 'shipped'])

      const unfilledTotal = unfilledOrders?.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0) || 0

      // Diagnostic logging before deposit check
      console.log('[Deposit Check] Before checking deposit requirement:', {
        sellerId: existingOrder.seller_id,
        orderId: orderId,
        orderAmount: existingOrder.total_amount,
        orderCurrency: orderDetails?.currency || 'USD',
        subscriptionTier: subscriptionInfo?.subscription_tier || 0,
        subscriptionCurrency: subscriptionInfo?.currency || 'USD',
        unfilledOrdersCount: unfilledOrders?.length || 0,
        unfilledTotal: unfilledTotal,
        unfilledOrders: unfilledOrders?.map(o => ({
          amount: o.total_amount,
          currency: o.currency,
        })),
        calculation: {
          unfilledTotal: unfilledTotal,
          newOrderAmount: existingOrder.total_amount,
          totalAfterNewOrder: unfilledTotal + existingOrder.total_amount,
          depositCredit: subscriptionInfo?.subscription_tier || 0,
          willTrigger: (unfilledTotal + existingOrder.total_amount) > (subscriptionInfo?.subscription_tier || 0),
        },
      })

      // Call database function that handles deposit check + side-effects atomically
      // Pass order currency to ensure proper conversion to USD
      const { data: depositResult, error: depositError } = await supabaseAdmin.rpc(
        'check_deposit_and_execute_side_effects',
        {
          p_seller_id: existingOrder.seller_id,
          p_order_id: orderId,
          p_order_amount: existingOrder.total_amount,
          p_payment_provider: 'stripe',
          p_payment_session_id: session.id,
        }
      )

      // Diagnostic logging after deposit check
      console.log('[Deposit Check] After checking deposit requirement:', {
        sellerId: existingOrder.seller_id,
        orderId: orderId,
        depositError: depositError ? {
          code: depositError.code,
          message: depositError.message,
          details: depositError.details,
        } : null,
        depositResult: depositResult && depositResult.length > 0 ? {
          requiresDeposit: depositResult[0].requires_deposit,
          requiredAmount: depositResult[0].required_amount,
          currentTier: depositResult[0].current_tier,
          suggestedTier: depositResult[0].suggested_tier,
          reason: depositResult[0].reason,
        } : null,
      })

      if (depositError) {
        console.error('Error checking deposit requirement:', depositError)
        // Continue with payment even if deposit check fails (fail open)
        // Log error for investigation
      } else if (depositResult && depositResult.length > 0 && depositResult[0].requires_deposit) {
        const depositCheck = depositResult[0]

        console.warn('[Deposit Check] Deposit required - blocking payment:', {
          sellerId: existingOrder.seller_id,
          orderId: orderId,
          requiredAmount: depositCheck.required_amount,
          currentTier: depositCheck.current_tier,
          reason: depositCheck.reason,
        })

        // DO NOT return checkout_url - "create but not expose" strategy
        // Even though session exists, buyer will never get the URL
        // Session will not be used, webhook will not trigger successfully
        return NextResponse.json(
          {
            error: 'Order cannot be paid at this time, please contact the seller',
            errorKey: 'order_payment_blocked_deposit',
            requiresDeposit: true,
            sellerId: existingOrder.seller_id,
            requiredAmount: parseFloat(depositCheck.required_amount?.toString() || '0'),
            currentTier: parseFloat(depositCheck.current_tier?.toString() || '0'),
            suggestedTier: parseFloat(depositCheck.suggested_tier?.toString() || '0'),
            reason: depositCheck.reason || 'Deposit required',
          },
          { status: 403 }
        )
      } else {
        console.log('[Deposit Check] No deposit required - allowing payment')
      }
    }

    // If no deposit required, return checkout URL
    console.log('No deposit required, returning checkout URL')
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
