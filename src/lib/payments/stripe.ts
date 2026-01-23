import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

// Lazy initialization to avoid errors when module loads without STRIPE_SECRET_KEY
let stripeInstance: Stripe | null = null
let stripeInstanceConfig: { secretKey: string } | null = null

/**
 * Get platform Stripe configuration from database
 * Falls back to environment variables if not found
 */
async function getPlatformStripeConfig(currency: string = 'USD'): Promise<{ secretKey: string } | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_platform_payment_account', {
      p_currency: currency,
      p_account_type: 'stripe',
    })

    if (error || !data || data.length === 0) {
      return null
    }

    const account = data[0]
    const accountInfo = account.account_info as any

    if (accountInfo?.stripe_secret_key) {
      return {
        secretKey: accountInfo.stripe_secret_key,
      }
    }

    return null
  } catch (error) {
    console.error('Error getting platform Stripe config:', error)
    return null
  }
}

/**
 * Get Stripe client instance
 * Priority: Database platform account > Environment variable
 */
async function getStripeClient(currency?: string): Promise<Stripe> {
  // Try to get config from database first
  let secretKey: string | null = null
  
  if (currency) {
    const platformConfig = await getPlatformStripeConfig(currency)
    if (platformConfig) {
      secretKey = platformConfig.secretKey
    }
  }

  // Fallback to environment variable
  if (!secretKey) {
    secretKey = process.env.STRIPE_SECRET_KEY || null
  }

  // Check if key exists and is not empty
  if (!secretKey || secretKey.trim() === '') {
    throw new Error('Stripe is not configured. Please set up a platform Stripe account or set STRIPE_SECRET_KEY environment variable.')
  }

  // Create new instance if config changed or doesn't exist
  if (!stripeInstance || stripeInstanceConfig?.secretKey !== secretKey) {
    try {
      stripeInstance = new Stripe(secretKey, {
        apiVersion: '2024-11-20.acacia',
      })
      stripeInstanceConfig = { secretKey }
    } catch (error: any) {
      throw new Error(`Failed to initialize Stripe: ${error.message}`)
    }
  }

  return stripeInstance
}

export async function createPaymentIntent(amount: number, currency: string = 'usd') {
  const stripe = await getStripeClient(currency.toUpperCase())
  
  // Convert amount to smallest currency unit
  const divisor = ['jpy', 'krw'].includes(currency.toLowerCase()) ? 1 : 100
  const unitAmount = Math.round(amount * divisor)
  
  return await stripe.paymentIntents.create({
    amount: unitAmount,
    currency: currency.toLowerCase(),
  })
}

/**
 * Refund a Stripe payment
 */
export async function refundStripePayment(
  paymentIntentId: string,
  amount?: number,
  currency: string = 'usd'
): Promise<Stripe.Refund> {
  const stripe = await getStripeClient(currency.toUpperCase())
  
  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
  }
  
  if (amount) {
    // Convert to cents
    refundParams.amount = Math.round(amount * 100)
  }
  
  return await stripe.refunds.create(refundParams)
}

export async function createCheckoutSession(
  amount: number,
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>,
  currency: string = 'usd'
) {
  // Normalize currency to uppercase for database lookup
  const normalizedCurrency = currency.toUpperCase()
  const stripe = await getStripeClient(normalizedCurrency)

  if (!amount || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }

  if (!successUrl || !cancelUrl) {
    throw new Error('Success and cancel URLs are required')
  }

  // Normalize currency to lowercase (Stripe uses lowercase)
  const stripeCurrency = currency.toLowerCase()

  // Determine product name based on type
  let productName = 'Stratos Payment'
  if (metadata?.type === 'order') {
    productName = 'Order Payment'
  } else if (metadata?.type === 'subscription') {
    productName =
      metadata.subscriptionType === 'seller'
        ? 'Seller Subscription'
        : metadata.subscriptionType === 'tip'
          ? 'Tip Subscription'
          : 'Affiliate Subscription'
  } else if (metadata?.type === 'tip') {
    productName = 'Tip'
  }

  // Convert amount to smallest currency unit (cents for USD, etc.)
  // JPY and KRW don't use decimal places
  const divisor = ['jpy', 'krw'].includes(stripeCurrency) ? 1 : 100
  const unitAmount = Math.round(amount * divisor)

  return await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: stripeCurrency,
          product_data: {
            name: productName,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: metadata || {},
  })
}
