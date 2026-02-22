import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPayPalOrder } from '@/lib/payments/paypal'
import { validateSellerPaymentReady } from '@/lib/payments/validate-seller-payment-ready'
import { isCurrencySupportedByPaymentMethod } from '@/lib/payments/currency-payment-support'
import type { Currency } from '@/lib/currency/detect-currency'

export async function POST(request: NextRequest) {
  try {
    // Payment library will check platform account first, then fallback to env vars
    // This check is just for early validation

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount, currency = 'USD', type, orderId, subscriptionType, subscriptionTier, postId, postAuthorId, returnUrl, cancelUrl } =
      await request.json()

    const normalizedCurrency = (currency?.toString() || 'USD').toUpperCase() as Currency
    if (!isCurrencySupportedByPaymentMethod(normalizedCurrency, 'paypal')) {
      return NextResponse.json(
        { error: 'PayPal does not support the selected currency (e.g. CNY). Please choose another payment method.' },
        { status: 400 }
      )
    }

    // Validate amount
    const numericAmount = parseFloat(amount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Validate type
    if (!type || !['order', 'subscription', 'tip'].includes(type)) {
      return NextResponse.json({ error: 'Invalid payment type' }, { status: 400 })
    }

    // Create metadata for tracking
    const metadata: Record<string, string> = {
      userId: user.id,
      type: type,
    }

    if (type === 'order' && orderId) {
      metadata.orderId = orderId

      // Get order details for validation (seller_type_snapshot for direct-seller deposit skip)
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('payment_status, seller_id, total_amount, currency, shipping_address, buyer_id, seller_type_snapshot')
        .eq('id', orderId)
        .single()

      if (orderError || !order) {
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
        paymentMethod: 'paypal', // Validate that seller supports PayPal payment
      })

        if (!validationResult.canAcceptPayment) {
          // UX Boundary: Second check failure = order exists but cannot pay
          console.warn('[paypal/create-order] Second check failed:', {
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

      // Create PayPal order FIRST (before deposit check)
      const paypalOrder = await createPayPalOrder(numericAmount, currency, metadata)

      // Direct sellers: skip deposit check (platform collects)
      // NOW check deposit requirement AFTER payment session creation (external sellers only)
      const isDirectOrder = (order as { seller_type_snapshot?: string }).seller_type_snapshot === 'direct'
      if (!isDirectOrder && order.seller_id && order.total_amount) {
        // Call database function that handles deposit check + side-effects atomically
        const { data: depositResult, error: depositError } = await supabaseAdmin.rpc(
          'check_deposit_and_execute_side_effects',
          {
            p_seller_id: order.seller_id,
            p_order_id: orderId,
            p_order_amount: order.total_amount,
            p_payment_provider: 'paypal',
            p_payment_session_id: paypalOrder.id, // Use PayPal order ID as session ID
          }
        )

        if (depositError) {
          console.error('Error checking deposit requirement:', depositError)
          // Continue with payment even if deposit check fails (fail open)
        } else if (depositResult && depositResult.length > 0 && depositResult[0].requires_deposit) {
          const depositCheck = depositResult[0]

          // DO NOT return orderId - "create but not expose" strategy
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

      return NextResponse.json({
        orderId: paypalOrder.id,
        status: paypalOrder.status,
      })
    } else if (type === 'subscription' && subscriptionType) {
      metadata.subscriptionType = subscriptionType
      if (subscriptionTier != null) metadata.subscriptionTier = String(subscriptionTier)
    } else if (type === 'tip' && postId && postAuthorId) {
      metadata.postId = postId
      metadata.postAuthorId = postAuthorId
    }

    if (returnUrl) metadata.returnUrl = returnUrl
    if (cancelUrl) metadata.cancelUrl = cancelUrl

    // Create PayPal order (for non-order types)
    const order = await createPayPalOrder(numericAmount, currency, metadata)

    return NextResponse.json({
      orderId: order.id,
      status: order.status,
    })
  } catch (error: any) {
    console.error('PayPal create order error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create PayPal order' },
      { status: 500 }
    )
  }
}
