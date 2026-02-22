/**
 * PayPal client config API
 * Returns clientId and sandbox for frontend PayPal SDK.
 * Same config source as create-order/capture-order (getPayPalClientConfig).
 * Public endpoint - clientId is safe to expose.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPayPalClientConfig } from '@/lib/payments/paypal'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const currency = searchParams.get('currency') || 'USD'

    console.log('[PayPal client-config] Request for currency:', currency)

    const config = await getPayPalClientConfig(currency)

    console.log('[PayPal client-config] Returning clientId:', config.clientId ? '***' + config.clientId.slice(-4) : 'empty', 'sandbox:', config.sandbox)

    return NextResponse.json({
      clientId: config.clientId,
      sandbox: config.sandbox,
    })
  } catch (error: any) {
    console.error('[PayPal client-config] Error:', error)
    return NextResponse.json(
      { error: error.message || 'PayPal not configured' },
      { status: 500 }
    )
  }
}
