// PayPal REST API helper functions

import { logPayment, LogLevel } from './logger'

/**
 * Get platform PayPal configuration from database
 * Falls back to environment variables if not found
 */
async function getPlatformPayPalConfig(currency: string = 'USD'): Promise<{ clientId: string; clientSecret: string; sandbox: boolean } | null> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_platform_payment_account', {
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
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Error getting platform PayPal config', {
      provider: 'paypal',
      error: error.message || 'Unknown error',
    })
    return null
  }
}

export async function getPayPalBaseUrl(currency: string = 'USD'): Promise<string> {
  const config = await getPayPalConfig(currency)
  return config.baseUrl
}

interface PayPalConfig {
  accessToken: string
  baseUrl: string
}

async function getPayPalConfig(currency: string = 'USD'): Promise<PayPalConfig> {
  // Try to get config from database first
  let clientId: string | null = null
  let clientSecret: string | null = null
  let sandbox: boolean = true

  const platformConfig = await getPlatformPayPalConfig(currency)
  if (platformConfig) {
    clientId = platformConfig.clientId
    clientSecret = platformConfig.clientSecret
    sandbox = platformConfig.sandbox
  } else {
    // Fallback to environment variables
    clientId = process.env.PAYPAL_CLIENT_ID || null
    clientSecret = process.env.PAYPAL_CLIENT_SECRET || null
    sandbox = process.env.NODE_ENV !== 'production'
  }

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured. Please set up a platform PayPal account or set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.')
  }

  const baseUrl = sandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com'

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`PayPal auth failed: ${error.error_description || error.error}`)
  }

  const data = await response.json()
  return { accessToken: data.access_token, baseUrl }
}

async function getPayPalAccessToken(currency: string = 'USD'): Promise<string> {
  const config = await getPayPalConfig(currency)
  return config.accessToken
}

export async function createPayPalOrder(
  amount: number,
  currency: string = 'USD',
  metadata?: Record<string, string>
) {
  const { accessToken, baseUrl } = await getPayPalConfig(currency)

  const orderData: any = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: currency,
          value: amount.toFixed(2),
        },
      },
    ],
  }

  // Add custom_id for tracking metadata
  if (metadata) {
    orderData.purchase_units[0].custom_id = JSON.stringify(metadata)
  }

  // Add application context if return/cancel URLs provided
  if (metadata?.returnUrl || metadata?.cancelUrl) {
    orderData.application_context = {
      return_url: metadata.returnUrl,
      cancel_url: metadata.cancelUrl,
      brand_name: 'Stratos',
    }
  }

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(orderData),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`PayPal order creation failed: ${JSON.stringify(error)}`)
  }

  return await response.json()
}

export async function capturePayPalOrder(orderId: string, currency: string = 'USD') {
  const { accessToken, baseUrl } = await getPayPalConfig(currency)

  const response = await fetch(
    `${baseUrl}/v2/checkout/orders/${orderId}/capture`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Prefer': 'return=representation',
      },
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`PayPal capture failed: ${JSON.stringify(error)}`)
  }

  return await response.json()
}

export async function getPayPalOrder(orderId: string, currency: string = 'USD') {
  const { accessToken, baseUrl } = await getPayPalConfig(currency)

  const response = await fetch(
    `${baseUrl}/v2/checkout/orders/${orderId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`PayPal get order failed: ${JSON.stringify(error)}`)
  }

  return await response.json()
}

export interface RefundPayPalPaymentResult {
  id: string
  status: string
  amount?: { currency_code: string; value: string }
}

/**
 * Refund a captured PayPal payment (full or partial).
 * Uses capture ID from order.payment_intent_id or payment_transaction_id.
 */
export async function refundPayPalPayment(
  captureId: string,
  amount: number | undefined,
  currency: string = 'USD',
  noteToPayer?: string
): Promise<RefundPayPalPaymentResult> {
  const { accessToken, baseUrl } = await getPayPalConfig(currency)

  const body: { amount?: { currency_code: string; value: string }; note_to_payer?: string } = {}
  if (amount != null && amount > 0) {
    body.amount = { currency_code: currency, value: amount.toFixed(2) }
  }
  if (noteToPayer) body.note_to_payer = noteToPayer

  const requestId = `refund-${captureId}-${Date.now()}`

  const response = await fetch(
    `${baseUrl}/v2/payments/captures/${captureId}/refund`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': requestId,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`PayPal refund failed: ${JSON.stringify(error)}`)
  }

  return await response.json()
}
