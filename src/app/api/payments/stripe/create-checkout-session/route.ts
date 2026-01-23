import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { createPaymentError, logPaymentError } from '@/lib/payments/error-handler'
import { logPaymentCreation } from '@/lib/payments/logger'

export async function POST(request: NextRequest) {
  try {
    // Payment library will check platform account first, then fallback to env vars
    // No need to check env vars here as library handles it

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Authentication error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount, subscriptionType, subscriptionTier, userId, successUrl, cancelUrl, currency = 'usd' } =
      await request.json()

    // Validate required fields
    if (!amount || !subscriptionType || !successUrl || !cancelUrl) {
      console.error('Missing required fields:', {
        amount: !!amount,
        subscriptionType: !!subscriptionType,
        successUrl: !!successUrl,
        cancelUrl: !!cancelUrl,
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

    // Validate subscription type
    if (!['seller', 'affiliate', 'tip'].includes(subscriptionType)) {
      console.error('Invalid subscription type:', subscriptionType)
      return NextResponse.json(
        { error: 'Invalid subscription type' },
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

    // Create checkout session
    logPaymentCreation('subscription', {
      userId: userId || user.id,
      amount: numericAmount,
      currency: currency.toUpperCase(),
      paymentMethod: 'stripe',
      subscriptionType,
      subscriptionTier: subscriptionTier?.toString(),
    })

    const session = await createCheckoutSession(
      numericAmount,
      successUrl,
      cancelUrl,
      {
        userId: userId || user.id,
        subscriptionType: subscriptionType,
        subscriptionTier: subscriptionTier?.toString(),
        type: 'subscription',
      },
      currency
    )

    if (!session || !session.url) {
      const error = createPaymentError(
        new Error('Failed to create checkout session: no URL returned'),
        {
          userId: userId || user.id,
          amount: numericAmount,
          currency: currency.toUpperCase(),
          paymentMethod: 'stripe',
        }
      )
      logPaymentError(error)
      return NextResponse.json(
        { error: error.userMessage },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    const paymentError = createPaymentError(error, {
      userId: user?.id,
      amount: parseFloat(amount) || undefined,
      currency: currency?.toUpperCase(),
      paymentMethod: 'stripe',
    })
    logPaymentError(paymentError)

    // Map error types to HTTP status codes
    let statusCode = 500
    if (paymentError.type === 'VALIDATION_ERROR') {
      statusCode = 400
    } else if (paymentError.type === 'CONFIGURATION_ERROR') {
      statusCode = 500
    } else if (paymentError.type === 'PROVIDER_ERROR') {
      statusCode = 502
    } else if (paymentError.type === 'NETWORK_ERROR') {
      statusCode = 503
    }

    return NextResponse.json(
      { error: paymentError.userMessage },
      { status: statusCode }
    )
  }
}
