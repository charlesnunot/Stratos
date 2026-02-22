import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { createPaymentError, logPaymentError } from '@/lib/payments/error-handler'
import { logPaymentCreation } from '@/lib/payments/logger'
import { getSubscriptionPrice, SELLER_TIERS_USD } from '@/lib/subscriptions/pricing'
import type { SubscriptionType } from '@/lib/subscriptions/pricing'
import type { Currency } from '@/lib/currency/detect-currency'
import { isCurrencySupportedByPaymentMethod } from '@/lib/payments/currency-payment-support'

export async function POST(request: NextRequest) {
  let requestUserId: string | undefined
  let requestAmount: number | undefined
  let requestCurrency: string | undefined
  try {
    // Payment library will check platform account first, then fallback to env vars
    // No need to check env vars here as library handles it

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Authentication error:', authError)
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    requestUserId = user.id

    const { amount, subscriptionType, subscriptionTier, userId, successUrl, cancelUrl, currency = 'usd', isFirstMonth = false } =
      await request.json()
    requestAmount = parseFloat(amount)
    requestCurrency = currency

    // Validate required fields (amount is computed server-side for subscriptions)
    if (!subscriptionType || !successUrl || !cancelUrl) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Missing required fields:', {
          subscriptionType: !!subscriptionType,
          successUrl: !!successUrl,
          cancelUrl: !!cancelUrl,
        })
      }
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate subscription type
    if (!['seller', 'affiliate', 'tip'].includes(subscriptionType)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Invalid subscription type:', subscriptionType)
      }
      return NextResponse.json(
        { error: 'Invalid subscription type' },
        { status: 400 }
      )
    }

    // Validate subscription tier for seller
    if (subscriptionType === 'seller') {
      if (subscriptionTier == null || subscriptionTier === '') {
        return NextResponse.json(
          { error: 'subscriptionTier is required for seller subscriptions' },
          { status: 400 }
        )
      }
      const tierNum = Number(subscriptionTier)
      if (!SELLER_TIERS_USD.includes(tierNum as (typeof SELLER_TIERS_USD)[number])) {
        return NextResponse.json(
          { error: `Invalid subscriptionTier. Must be one of: ${SELLER_TIERS_USD.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Validate URLs
    try {
      new URL(successUrl)
      new URL(cancelUrl)
    } catch (urlError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Invalid URLs:', { successUrl, cancelUrl })
      }
      return NextResponse.json(
        { error: 'Invalid success or cancel URL' },
        { status: 400 }
      )
    }

    // Server-side price: do not trust frontend amount for subscriptions
    const normalizedCurrency = (currency?.toString() || 'usd').toUpperCase() as Currency
    let priceResult
    try {
      priceResult = getSubscriptionPrice(
        subscriptionType as SubscriptionType,
        subscriptionType === 'seller' ? Number(subscriptionTier) : undefined,
        normalizedCurrency
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to calculate subscription price'
      if (process.env.NODE_ENV === 'development') {
        console.error('Subscription price calculation error:', err)
      }
      return NextResponse.json(
        { error: message },
        { status: 400 }
      )
    }

    // 3档纯净模式: 应用首月折扣
    if (isFirstMonth && subscriptionType === 'seller') {
      priceResult = {
        ...priceResult,
        amount: priceResult.amount * 0.5 // 50% 折扣
      }
    }

    // Optional: reject if frontend sent amount that differs from server (anti-tampering)
    if (amount !== undefined && amount !== null && amount !== '') {
      const frontendAmount = parseFloat(String(amount))
      const validatedCurrency = (currency?.toString() || 'USD').toUpperCase()
      const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(validatedCurrency)
      const precision = isZeroDecimalCurrency ? 0 : 0.01
      
      if (!isNaN(frontendAmount) && Math.abs(frontendAmount - priceResult.amount) > precision) {
        return NextResponse.json(
          { error: 'Amount mismatch with server calculation' },
          { status: 400 }
        )
      }
    }

    const numericAmount = priceResult.amount
    const payCurrency = priceResult.currency

    if (!isCurrencySupportedByPaymentMethod(payCurrency, 'stripe')) {
      return NextResponse.json(
        { error: 'This payment method does not support the selected currency. Please choose another payment method.' },
        { status: 400 }
      )
    }

    // Subscription must be for the authenticated user only (ignore body userId to prevent forging)
    const effectiveUserId = user.id

    // Create checkout session with server-calculated amount
    logPaymentCreation('subscription', {
      userId: effectiveUserId,
      amount: numericAmount,
      currency: payCurrency,
      paymentMethod: 'stripe',
      subscriptionType,
      subscriptionTier: subscriptionTier?.toString(),
    })

    const session = await createCheckoutSession(
      numericAmount,
      successUrl,
      cancelUrl,
      {
        userId: effectiveUserId,
        subscriptionType: subscriptionType,
        subscriptionTier: subscriptionTier?.toString(),
        type: 'subscription',
        isFirstMonth: isFirstMonth ? 'true' : 'false', // 3档纯净模式: 传递首月折扣标记
      },
      payCurrency.toLowerCase()
    )

    if (!session || !session.url) {
      const error = createPaymentError(
        new Error('Failed to create checkout session: no URL returned'),
        {
          userId: effectiveUserId,
          amount: numericAmount,
          currency: payCurrency,
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
  } catch (error: unknown) {
    const paymentError = createPaymentError(error as Error, {
      userId: requestUserId,
      amount: requestAmount ?? undefined,
      currency: requestCurrency?.toUpperCase(),
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
