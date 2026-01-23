/**
 * Stripe Connect integration
 * Handles Stripe Connect account creation, linking, and transfers
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

let stripeInstances: Map<string, Stripe> = new Map()

/**
 * Get platform Stripe configuration from database
 */
async function getPlatformStripeConfig(currency: string = 'USD'): Promise<{ secretKey: string } | null> {
  try {
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

    const { data, error } = await supabaseAdmin.rpc('get_platform_payment_account', {
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

async function getStripeClient(currency: string = 'USD'): Promise<Stripe> {
  // Check cache first
  if (stripeInstances.has(currency)) {
    return stripeInstances.get(currency)!
  }

  // Try to get config from database first
  let secretKey: string | null = null
  
  const platformConfig = await getPlatformStripeConfig(currency)
  if (platformConfig) {
    secretKey = platformConfig.secretKey
  } else {
    // Fallback to environment variable
    secretKey = process.env.STRIPE_SECRET_KEY || null
  }

  if (!secretKey || secretKey.trim() === '') {
    throw new Error('Stripe is not configured. Please set up a platform Stripe account or set STRIPE_SECRET_KEY environment variable.')
  }

  try {
    const stripe = new Stripe(secretKey, {
      apiVersion: '2024-11-20.acacia',
    })
    stripeInstances.set(currency, stripe)
    return stripe
  } catch (error: any) {
    throw new Error(`Failed to initialize Stripe: ${error.message}`)
  }
}

/**
 * Create a Stripe Connect account
 */
export async function createConnectAccount(params: {
  email: string
  country?: string
  type?: 'express' | 'standard' | 'custom'
  currency?: string
}): Promise<{ accountId: string; error?: string }> {
  try {
    const currency = params.currency || 'USD'
    const stripe = await getStripeClient(currency)
    
    const account = await stripe.accounts.create({
      type: params.type || 'express',
      country: params.country || 'US',
      email: params.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })

    return { accountId: account.id }
  } catch (error: any) {
    console.error('Error creating Stripe Connect account:', error)
    return {
      accountId: '',
      error: error.message || 'Failed to create Stripe Connect account',
    }
  }
}

/**
 * Get account link for Stripe Connect onboarding
 */
export async function getConnectAccountLink(params: {
  accountId: string
  refreshUrl: string
  returnUrl: string
  currency?: string
}): Promise<{ url: string; error?: string }> {
  try {
    const currency = params.currency || 'USD'
    const stripe = await getStripeClient(currency)
    
    const accountLink = await stripe.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: 'account_onboarding',
    })

    return { url: accountLink.url }
  } catch (error: any) {
    console.error('Error creating Stripe Connect account link:', error)
    return {
      url: '',
      error: error.message || 'Failed to create account link',
    }
  }
}

/**
 * Get login link for existing Stripe Connect account
 */
export async function getConnectLoginLink(accountId: string, currency: string = 'USD'): Promise<{ url: string; error?: string }> {
  try {
    const stripe = await getStripeClient(currency)
    
    const loginLink = await stripe.accounts.createLoginLink(accountId)

    return { url: loginLink.url }
  } catch (error: any) {
    console.error('Error creating Stripe Connect login link:', error)
    return {
      url: '',
      error: error.message || 'Failed to create login link',
    }
  }
}

/**
 * Transfer money to seller via Stripe Connect
 */
export async function transferToSellerViaStripe(params: {
  sellerId: string
  amount: number
  currency: string
  stripeAccountId: string
}): Promise<{ success: boolean; transferId?: string; error?: string }> {
  try {
    const stripe = await getStripeClient(params.currency.toUpperCase())

    if (!params.stripeAccountId) {
      return {
        success: false,
        error: 'Stripe Connect account ID is required',
      }
    }

    // Convert amount to smallest currency unit
    const divisor = ['jpy', 'krw'].includes(params.currency.toLowerCase()) ? 1 : 100
    const unitAmount = Math.round(params.amount * divisor)

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: unitAmount,
      currency: params.currency.toLowerCase(),
      destination: params.stripeAccountId,
      metadata: {
        seller_id: params.sellerId,
      },
    })

    return {
      success: true,
      transferId: transfer.id,
    }
  } catch (error: any) {
    console.error('Error transferring via Stripe Connect:', error)
    return {
      success: false,
      error: error.message || 'Failed to transfer via Stripe Connect',
    }
  }
}

/**
 * Get Stripe Connect account status
 */
export async function getConnectAccountStatus(accountId: string, currency: string = 'USD'): Promise<{
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  error?: string
}> {
  try {
    const stripe = await getStripeClient(currency)
    
    const account = await stripe.accounts.retrieve(accountId)

    return {
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      detailsSubmitted: account.details_submitted || false,
    }
  } catch (error: any) {
    console.error('Error retrieving Stripe Connect account:', error)
    return {
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      error: error.message || 'Failed to retrieve account status',
    }
  }
}
