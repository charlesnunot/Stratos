/**
 * API for creating pending subscriptions
 * This API addresses Risk 2: prevent frontend from directly inserting subscriptions
 * All subscription creation must go through this API for validation
 * 
 * 3档纯净模式更新:
 * - 支持新的 tier 值: 15, 50, 100
 * - 记录 display_price 和 product_limit
 * - 支持首月折扣
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  getSubscriptionPrice, 
  SELLER_TIERS_USD, 
  SELLER_TIER_DETAILS,
  getDisplayPrice,
  getProductLimit 
} from '@/lib/subscriptions/pricing'
import type { SubscriptionType } from '@/lib/subscriptions/pricing'
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

    const body = await request.json()
    const { 
      subscriptionType, 
      subscriptionTier, 
      paymentMethod, 
      currency = 'USD',
      isFirstMonth = false,  // 新增: 是否首月订阅
      // 多币种支持: 用户货币和金额
      userCurrency,
      userAmount,
      // 平台货币和金额 (前端已转换)
      platformCurrency,
      platformAmount
    } = body

    // Validate required fields
    if (!subscriptionType || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing required fields: subscriptionType and paymentMethod are required' },
        { status: 400 }
      )
    }

    // Validate subscription type
    if (!['seller', 'affiliate', 'tip'].includes(subscriptionType)) {
      return NextResponse.json(
        { error: 'Invalid subscriptionType. Must be one of: seller, affiliate, tip' },
        { status: 400 }
      )
    }

    // Validate payment method - only allow alipay, wechat, bank
    // Stripe and PayPal have their own checkout/capture flows
    if (!['alipay', 'wechat', 'bank'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'Invalid paymentMethod. For Stripe/PayPal, use their respective checkout flows. Only alipay, wechat, and bank are allowed here.' },
        { status: 400 }
      )
    }

    const normalizedCurrency = (currency?.toString() || 'USD').toUpperCase() as Currency
    if (!isCurrencySupportedByPaymentMethod(normalizedCurrency, paymentMethod as PaymentMethodId)) {
      return NextResponse.json(
        { error: 'This payment method does not support the selected currency. Please choose another payment method.' },
        { status: 400 }
      )
    }

    // Validate subscription tier for seller subscriptions
    if (subscriptionType === 'seller') {
      if (!subscriptionTier) {
        return NextResponse.json(
          { error: 'subscriptionTier is required for seller subscriptions' },
          { status: 400 }
        )
      }
      if (!SELLER_TIERS_USD.includes(subscriptionTier as (typeof SELLER_TIERS_USD)[number])) {
        return NextResponse.json(
          { error: `Invalid subscriptionTier. Must be one of: ${SELLER_TIERS_USD.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Calculate subscription price using backend logic (don't trust frontend)
    let priceResult
    try {
      priceResult = getSubscriptionPrice(
        subscriptionType as SubscriptionType,
        subscriptionType === 'seller' ? subscriptionTier : undefined,
        currency as any
      )
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to calculate subscription price: ${error.message}` },
        { status: 400 }
      )
    }

    // 3档纯净模式: 获取显示价格和商品限制
    let displayPrice = priceResult.amountUsd
    let productLimit = 0
    let isDiscounted = false
    let discountExpiryDate: string | null = null

    if (subscriptionType === 'seller' && subscriptionTier) {
      const tierDetail = SELLER_TIER_DETAILS[subscriptionTier]
      if (tierDetail) {
        displayPrice = tierDetail.displayPrice
        productLimit = tierDetail.productLimit
      }

      // 检查是否首月折扣
      if (isFirstMonth) {
        const priceInfo = getDisplayPrice(subscriptionTier, normalizedCurrency, true)
        if (priceInfo.discounted !== null) {
          displayPrice = priceInfo.discounted
          isDiscounted = true
          // 折扣30天后过期
          const expiryDate = new Date()
          expiryDate.setDate(expiryDate.getDate() + 30)
          discountExpiryDate = expiryDate.toISOString()
        }
      }
    }

    // If frontend provided amount, validate it matches calculated amount
    if (body.amount !== undefined) {
      const frontendAmount = parseFloat(body.amount)
      const calculatedAmount = isDiscounted ? displayPrice : priceResult.amount
      const validatedCurrency = (currency?.toString() || 'USD').toUpperCase()
      const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(validatedCurrency)
      const precision = isZeroDecimalCurrency ? 0 : 0.01
      
      if (Math.abs(frontendAmount - calculatedAmount) > precision) {
        return NextResponse.json(
          { 
            error: 'Amount mismatch. Frontend amount does not match calculated amount.',
            calculatedAmount,
            providedAmount: frontendAmount
          },
          { status: 400 }
        )
      }
    }

    // Get Supabase admin client for inserting subscription
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

    // Calculate expires_at (30 days from now)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    // 多币种支持: 确定最终使用的货币和金额
    // 如果前端提供了平台货币和金额，使用它们；否则使用计算的价格
    const finalCurrency = platformCurrency || priceResult.currency
    const finalAmount = platformAmount || priceResult.amountUsd
    const finalUserCurrency = userCurrency || currency
    const finalUserAmount = userAmount || priceResult.amount

    // 获取当前汇率 (用于记录)
    let exchangeRate: number | null = null
    if (finalUserCurrency !== finalCurrency) {
      // 查询汇率表获取当前汇率
      const { data: rateData } = await supabaseAdmin
        .from('exchange_rates')
        .select('rate')
        .eq('base_currency', finalUserCurrency)
        .eq('target_currency', finalCurrency)
        .lte('valid_from', new Date().toISOString())
        .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
        .order('valid_from', { ascending: false })
        .limit(1)
        .single()
      
      if (rateData) {
        exchangeRate = rateData.rate
      }
    }

    // Insert subscription with status 'pending'
    // 3档纯净模式: 记录所有新字段
    // 多币种支持: 记录用户货币和平台货币
    const depositCredit = subscriptionType === 'seller' && subscriptionTier ? subscriptionTier : null

    const { data: subscription, error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        subscription_type: subscriptionType,
        subscription_tier: subscriptionType === 'seller' ? subscriptionTier : null,
        deposit_credit: depositCredit,
        payment_method: paymentMethod,
        // 多币种支持字段
        amount: finalAmount,                    // 平台收款金额
        currency: finalCurrency,                 // 平台收款货币
        user_amount: finalUserAmount,           // 用户看到的金额
        user_currency: finalUserCurrency,       // 用户选择的货币
        exchange_rate: exchangeRate,            // 支付时的汇率
        exchange_rate_at: exchangeRate ? new Date().toISOString() : null,
        // 原有字段
        display_price: displayPrice,            // 显示价格
        product_limit: productLimit,            // 商品数量限制
        is_discounted: isDiscounted,            // 是否首月折扣
        discount_expiry_date: discountExpiryDate, // 折扣到期日
        status: 'pending',
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[create-pending] Error inserting subscription:', insertError)
      }
      logAudit({
        action: 'create_pending_subscription',
        userId: user.id,
        resourceId: undefined,
        resourceType: 'subscription',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: insertError.message },
      })
      return NextResponse.json(
        { error: insertError.message || 'Failed to create subscription' },
        { status: 500 }
      )
    }

    logAudit({
      action: 'create_pending_subscription',
      userId: user.id,
      resourceId: subscription.id,
      resourceType: 'subscription',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        subscriptionTier,
        displayPrice,
        productLimit,
        isDiscounted,
      },
    })

    // Do NOT update profiles here - pending subscriptions don't activate features
    // Profile will be updated when payment is confirmed (via webhook or manual approval)

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      expiresAt: expiresAt.toISOString(),
      subscription: {
        id: subscription.id,
        subscription_type: subscription.subscription_type,
        status: subscription.status,
        amount: subscription.amount,
        display_price: subscription.display_price,
        currency: subscription.currency,
        product_limit: subscription.product_limit,
        is_discounted: subscription.is_discounted,
      },
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[create-pending] Unexpected error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to create pending subscription'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
