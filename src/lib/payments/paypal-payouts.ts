/**
 * PayPal Payouts integration
 * Handles money transfers to sellers via PayPal Payouts API
 */

import { createClient } from '@supabase/supabase-js'

interface PayPalPayoutParams {
  email: string
  amount: number
  currency: string
  note?: string
}

interface PayPalPayoutResult {
  success: boolean
  payoutId?: string
  error?: string
}

/**
 * Get platform PayPal configuration from database
 */
async function getPlatformPayPalConfig(currency: string = 'USD'): Promise<{
  clientId: string
  clientSecret: string
  sandbox: boolean
} | null> {
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
      p_account_type: 'paypal',
    })

    if (error || !data || data.length === 0) {
      return null
    }

    const account = data[0]
    const accountInfo = account.account_info as any

    if (accountInfo?.client_id && accountInfo?.client_secret) {
      return {
        clientId: accountInfo.client_id,
        clientSecret: accountInfo.client_secret,
        sandbox: accountInfo.sandbox !== undefined ? accountInfo.sandbox : true,
      }
    }

    return null
  } catch (error) {
    console.error('Error getting platform PayPal config:', error)
    return null
  }
}

/**
 * Create a PayPal payout to seller
 * Note: This requires PayPal Payouts API access and proper authentication
 */
export async function createPayPalPayout({
  email,
  amount,
  currency,
  note,
}: PayPalPayoutParams): Promise<PayPalPayoutResult> {
  try {
    // Try to get config from database first
    let clientId: string | null = null
    let clientSecret: string | null = null
    let isSandbox: boolean = true

    const platformConfig = await getPlatformPayPalConfig(currency)
    if (platformConfig) {
      clientId = platformConfig.clientId
      clientSecret = platformConfig.clientSecret
      isSandbox = platformConfig.sandbox
    } else {
      // Fallback to environment variables
      clientId = process.env.PAYPAL_CLIENT_ID || null
      clientSecret = process.env.PAYPAL_CLIENT_SECRET || null
      isSandbox = process.env.PAYPAL_SANDBOX === 'true'
    }

    if (!clientId || !clientSecret) {
      return {
        success: false,
        error: 'PayPal is not configured. Please set up a platform PayPal account or set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.',
      }
    }

    const baseUrl = isSandbox
      ? 'https://api.sandbox.paypal.com'
      : 'https://api.paypal.com'

    // Get access token
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json()
      return {
        success: false,
        error: `Failed to get PayPal access token: ${error.error_description || error.error}`,
      }
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Create payout
    const payoutResponse = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: `payout_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          email_subject: 'You have a payout!',
          email_message: note || 'You have received a payout from Stratos.',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: amount.toFixed(2),
              currency: currency.toUpperCase(),
            },
            receiver: email,
            note: note || 'Payment from Stratos',
            sender_item_id: `item_${Date.now()}`,
          },
        ],
      }),
    })

    if (!payoutResponse.ok) {
      const error = await payoutResponse.json()
      return {
        success: false,
        error: `PayPal payout failed: ${error.message || JSON.stringify(error)}`,
      }
    }

    const payoutData = await payoutResponse.json()

    // PayPal Payouts API returns a batch_payout object
    const payoutId = payoutData.batch_header?.payout_batch_id || payoutData.id

    return {
      success: true,
      payoutId,
    }
  } catch (error: any) {
    console.error('PayPal payout error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error during PayPal payout',
    }
  }
}

/**
 * Get payout status
 */
export async function getPayPalPayoutStatus(payoutId: string, currency: string = 'USD'): Promise<{
  success: boolean
  status?: string
  error?: string
}> {
  try {
    // Try to get config from database first
    let clientId: string | null = null
    let clientSecret: string | null = null
    let isSandbox: boolean = true

    const platformConfig = await getPlatformPayPalConfig(currency)
    if (platformConfig) {
      clientId = platformConfig.clientId
      clientSecret = platformConfig.clientSecret
      isSandbox = platformConfig.sandbox
    } else {
      // Fallback to environment variables
      clientId = process.env.PAYPAL_CLIENT_ID || null
      clientSecret = process.env.PAYPAL_CLIENT_SECRET || null
      isSandbox = process.env.PAYPAL_SANDBOX === 'true'
    }

    if (!clientId || !clientSecret) {
      return {
        success: false,
        error: 'PayPal is not configured',
      }
    }

    const baseUrl = isSandbox
      ? 'https://api.sandbox.paypal.com'
      : 'https://api.paypal.com'

    // Get access token
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })

    if (!tokenResponse.ok) {
      return {
        success: false,
        error: 'Failed to get PayPal access token',
      }
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get payout status
    const statusResponse = await fetch(`${baseUrl}/v1/payments/payouts/${payoutId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!statusResponse.ok) {
      return {
        success: false,
        error: 'Failed to get payout status',
      }
    }

    const statusData = await statusResponse.json()
    const status = statusData.batch_header?.batch_status || statusData.status

    return {
      success: true,
      status,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}
