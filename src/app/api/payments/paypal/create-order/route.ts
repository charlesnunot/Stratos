import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPayPalOrder } from '@/lib/payments/paypal'

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
    } else if (type === 'subscription' && subscriptionType) {
      metadata.subscriptionType = subscriptionType
      if (subscriptionTier != null) metadata.subscriptionTier = String(subscriptionTier)
    } else if (type === 'tip' && postId && postAuthorId) {
      metadata.postId = postId
      metadata.postAuthorId = postAuthorId
    }

    if (returnUrl) metadata.returnUrl = returnUrl
    if (cancelUrl) metadata.cancelUrl = cancelUrl

    // Create PayPal order
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
