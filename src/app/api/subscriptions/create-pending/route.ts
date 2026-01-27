/**
 * API for creating pending subscriptions
 * This API addresses Risk 2: prevent frontend from directly inserting subscriptions
 * All subscription creation must go through this API for validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionPrice, SELLER_TIERS_USD } from '@/lib/subscriptions/pricing'
import type { SubscriptionType } from '@/lib/subscriptions/pricing'

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
    const { subscriptionType, subscriptionTier, paymentMethod, currency = 'USD' } = body

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

    // If frontend provided amount, validate it matches calculated amount
    if (body.amount !== undefined) {
      const frontendAmount = parseFloat(body.amount)
      const calculatedAmount = priceResult.amount
      // Allow small floating point differences (0.01)
      if (Math.abs(frontendAmount - calculatedAmount) > 0.01) {
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

    // Insert subscription with status 'pending'
    // Note: deposit_credit = subscription_tier for seller subscriptions
    const depositCredit = subscriptionType === 'seller' && subscriptionTier ? subscriptionTier : null

    const { data: subscription, error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        subscription_type: subscriptionType,
        subscription_tier: subscriptionType === 'seller' ? subscriptionTier : null,
        deposit_credit: depositCredit,
        payment_method: paymentMethod,
        amount: priceResult.amountUsd, // Store USD amount
        currency: priceResult.currency,
        status: 'pending',
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('[create-pending] Error inserting subscription:', insertError)
      return NextResponse.json(
        { error: insertError.message || 'Failed to create subscription' },
        { status: 500 }
      )
    }

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
        currency: subscription.currency,
      },
    })
  } catch (error: any) {
    console.error('[create-pending] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create pending subscription' },
      { status: 500 }
    )
  }
}
