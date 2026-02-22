/**
 * Deposit payment API
 * Handles seller deposit payment creation and processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { checkSellerDepositRequirement } from '@/lib/deposits/check-deposit-requirement'
import { checkSellerPermission } from '@/lib/auth/check-subscription'
import { logAudit } from '@/lib/api/audit'
import { isCurrencySupportedByPaymentMethod } from '@/lib/payments/currency-payment-support'
import type { PaymentMethodId } from '@/lib/payments/currency-payment-support'
import type { Currency } from '@/lib/currency/detect-currency'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const sellerCheck = await checkSellerPermission(user.id, supabaseAdmin)
    if (!sellerCheck.hasPermission) {
      return NextResponse.json(
        { error: sellerCheck.reason || 'Seller subscription required' },
        { status: 403 }
      )
    }

    // Direct sellers do not need deposit (platform collects)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('seller_type')
      .eq('id', user.id)
      .single()
    if ((profile as { seller_type?: string } | null)?.seller_type === 'direct') {
      return NextResponse.json(
        { error: 'Direct sellers do not need to pay deposit. Platform collects payments.' },
        { status: 400 }
      )
    }

    const { amount, currency = 'USD', paymentMethod = 'stripe' } = await request.json()

    const normalizedCurrency = (currency?.toString() || 'USD').toUpperCase() as Currency
    if (!isCurrencySupportedByPaymentMethod(normalizedCurrency, paymentMethod as PaymentMethodId)) {
      return NextResponse.json(
        { error: 'This payment method does not support the selected currency. Please choose another payment method.' },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!amount) {
      return NextResponse.json({ error: 'Missing required field: amount' }, { status: 400 })
    }

    // Validate amount
    const numericAmount = parseFloat(amount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Check current deposit requirement (supabaseAdmin from seller check above)
    const depositCheck = await checkSellerDepositRequirement(user.id, 0, supabaseAdmin)

    if (!depositCheck.requiresDeposit) {
      return NextResponse.json(
        { error: 'No deposit required at this time' },
        { status: 400 }
      )
    }

    // Get or create deposit lot
    const { data: existingLot } = await supabaseAdmin
      .from('seller_deposit_lots')
      .select('*')
      .eq('seller_id', user.id)
      .eq('status', 'required')
      .order('required_at', { ascending: false })
      .limit(1)
      .single()

    let depositLotId: string

    if (existingLot) {
      depositLotId = existingLot.id
      // Update existing lot if amount changed
      if (parseFloat(existingLot.required_amount) !== numericAmount) {
        await supabaseAdmin
          .from('seller_deposit_lots')
          .update({ required_amount: numericAmount })
          .eq('id', depositLotId)
      }
    } else {
      // Create new deposit lot
      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('subscription_tier')
        .eq('user_id', user.id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('subscription_tier', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: newLot, error: lotError } = await supabaseAdmin
        .from('seller_deposit_lots')
        .insert({
          seller_id: user.id,
          required_amount: numericAmount,
          currency: currency.toUpperCase(),
          status: 'required',
          subscription_tier_snapshot: subscription?.subscription_tier || 0,
          required_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (lotError || !newLot) {
        console.error('Error creating deposit lot:', lotError)
        return NextResponse.json(
          { error: 'Failed to create deposit lot' },
          { status: 500 }
        )
      }

      depositLotId = newLot.id
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000'
    const locale = request.headers.get('x-locale') || 'zh'
    const localePrefix = locale !== 'zh' ? `/${locale}` : ''
    const successUrl = `${origin}${localePrefix}/seller/deposit/pay/success?lotId=${depositLotId}`
    const cancelUrl = `${origin}${localePrefix}/seller/deposit/pay`

    // Log audit for deposit payment initiation
    logAudit({
      action: 'deposit_payment_initiate',
      userId: user.id,
      resourceId: depositLotId,
      resourceType: 'deposit_lot',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { paymentMethod, currency },
    })

    // Handle different payment methods
    if (paymentMethod === 'stripe') {
      const session = await createCheckoutSession(
        numericAmount,
        successUrl,
        cancelUrl,
        {
          userId: user.id,
          depositLotId: depositLotId,
          type: 'deposit',
        },
        currency.toLowerCase()
      )

      if (!session || !session.url) {
        return NextResponse.json(
          { error: 'Failed to create checkout session' },
          { status: 500 }
        )
      }

      return NextResponse.json({ url: session.url, sessionId: session.id })
    }

    if (paymentMethod === 'paypal') {
      const { createPayPalOrder } = await import('@/lib/payments/paypal')
      const metadata: Record<string, string> = {
        userId: user.id,
        depositLotId,
        type: 'deposit',
        returnUrl: successUrl,
        cancelUrl,
      }
      const order = await createPayPalOrder(numericAmount, currency, metadata)
      const approveLink = (order.links as { rel: string; href: string }[] | undefined)?.find(
        (l) => l.rel === 'approve'
      )?.href
      if (!approveLink) {
        return NextResponse.json(
          { error: 'Failed to create PayPal approval URL' },
          { status: 500 }
        )
      }
      return NextResponse.json({ url: approveLink, orderId: order.id })
    }

    if (paymentMethod === 'alipay') {
      const { createAlipayOrder } = await import('@/lib/payments/alipay')
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin
      const notifyUrl = `${baseUrl}/api/payments/alipay/callback`
      const outTradeNo = `deposit_${depositLotId}_${Date.now()}`
      const result = await createAlipayOrder({
        outTradeNo,
        totalAmount: numericAmount,
        subject: 'Seller deposit',
        returnUrl: successUrl,
        notifyUrl,
        metadata: { type: 'deposit', depositLotId, userId: user.id },
      })
      const formData: Record<string, string> = {}
      const pairs = (result.orderString || '').split('&')
      for (const p of pairs) {
        const eq = p.indexOf('=')
        if (eq < 0) continue
        const k = p.slice(0, eq)
        const v = p.slice(eq + 1)
        if (k) formData[k] = decodeURIComponent(v || '')
      }
      const gateway = process.env.NODE_ENV === 'production'
        ? 'https://openapi.alipay.com/gateway.do'
        : 'https://openapi.alipaydev.com/gateway.do'
      return NextResponse.json({
        paymentMethod: 'alipay',
        formAction: gateway,
        formData,
        outTradeNo,
        lotId: depositLotId,
      })
    }

    if (paymentMethod === 'wechat') {
      const { createWeChatPayOrder } = await import('@/lib/payments/wechat')
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin
      const notifyUrl = `${baseUrl}/api/payments/wechat/notify`
      const outTradeNo = `deposit_${depositLotId}_${Date.now()}`
      const wechatOrder = await createWeChatPayOrder({
        outTradeNo,
        totalAmount: numericAmount,
        description: 'Seller deposit',
        notifyUrl,
      })
      const codeUrl = (wechatOrder as { codeUrl?: string })?.codeUrl ?? (wechatOrder as { code_url?: string })?.code_url
      if (!codeUrl) {
        return NextResponse.json(
          { error: 'Failed to create WeChat Pay QR' },
          { status: 500 }
        )
      }
      return NextResponse.json({
        paymentMethod: 'wechat',
        codeUrl,
        outTradeNo,
        lotId: depositLotId,
      })
    }

    if (paymentMethod === 'bank') {
      return NextResponse.json(
        { error: 'Bank transfer (upload proof) is not supported for deposits. Please use Stripe, PayPal, Alipay, or WeChat.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: `Payment method ${paymentMethod} not supported` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Deposit payment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process deposit payment' },
      { status: 500 }
    )
  }
}

// Note: Payment success is handled by Stripe webhook
// The success page will check the deposit lot status from the database
