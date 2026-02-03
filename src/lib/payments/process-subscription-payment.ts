/**
 * Unified service layer for processing subscription payments
 * Supports tiered seller subscriptions, affiliate subscriptions, and tip feature subscriptions.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { enableSellerPayment } from '../deposits/payment-control'
import { logPaymentSuccess, logPaymentFailure, logIdempotencyHit, logPayment, LogLevel } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'
import { convertCurrency } from '@/lib/currency/convert-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { logAudit } from '@/lib/api/audit'

interface ProcessSubscriptionPaymentParams {
  userId: string
  subscriptionType: 'seller' | 'affiliate' | 'tip'
  amount: number
  expiresAt: Date
  subscriptionTier?: number // For seller subscriptions: 5, 15, 40, 80, 200
  currency?: string
  paymentMethod?: string
  supabaseAdmin: SupabaseClient
}

export async function processSubscriptionPayment({
  userId,
  subscriptionType,
  amount,
  expiresAt,
  subscriptionTier,
  currency = 'USD',
  paymentMethod = 'stripe',
  supabaseAdmin,
}: ProcessSubscriptionPaymentParams): Promise<{ success: boolean; error?: string }> {
  try {
    // For seller subscriptions, subscription_tier = deposit_credit
    const depositCredit = subscriptionType === 'seller' && subscriptionTier ? subscriptionTier : null

    // Create subscription record
    const { data: newSub, error: subError } = await supabaseAdmin.from('subscriptions').insert({
      user_id: userId,
      subscription_type: subscriptionType,
      subscription_tier: subscriptionTier || null,
      deposit_credit: depositCredit,
      payment_method: paymentMethod,
      amount: amount,
      currency: currency,
      status: 'active',
      starts_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
      .select('id')
      .single()

    if (subError) {
      // Check if it's a duplicate (idempotency)
      if (subError.code === '23505') {
        // Unique constraint violation
        logIdempotencyHit('subscription', {
          userId,
          subscriptionType,
          amount,
          currency,
        })
        return { success: true }
      }
      const paymentError = createPaymentError(subError, {
        userId,
        subscriptionType,
        amount,
        currency,
      })
      logPaymentError(paymentError)
      return { success: false, error: paymentError.userMessage }
    }

    // Sync profile subscription-derived fields from subscriptions table
    // This is the single source of truth for subscription state (Risk 3)
    // The sync function will calculate subscription_type, subscription_expires_at,
    // seller_subscription_tier, tip_enabled, and role from active subscriptions
    const { error: syncError } = await supabaseAdmin.rpc('sync_profile_subscription_derived', {
      p_user_id: userId,
    })

    if (syncError) {
      logPayment(LogLevel.ERROR, 'Error syncing profile subscription state', {
        userId,
        subscriptionType,
        error: syncError.message || 'Unknown error',
      })
      // Don't fail the payment if sync fails, but log it
      // The subscription is already created, sync can be retried later
    }

    // If seller subscription, check if payment should be enabled
    if (subscriptionType === 'seller') {
      // Enable payment if it was disabled due to deposit requirement
      await enableSellerPayment(userId, supabaseAdmin)
    }

    // Create notification (use content_key for i18n)
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type: 'system',
      title: 'Subscription Activated',
      content: `Your ${subscriptionType} subscription has been activated successfully`,
      related_type: 'user',
      link: '/subscription/manage',
      content_key: 'subscription_renewed',
      content_params: {
        subscriptionType,
        subscriptionTier: subscriptionTier?.toString() || '',
      },
    })

    logPaymentSuccess('subscription', {
      userId,
      subscriptionType,
      amount,
      currency,
      paymentMethod,
      subscriptionTier: subscriptionTier?.toString(),
    })

    logAudit({
      action: 'subscription_payment_success',
      userId,
      resourceId: newSub?.id,
      resourceType: 'subscription',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        subscriptionType,
        subscriptionTier: subscriptionTier?.toString() ?? undefined,
        amount,
        currency,
      },
    })

    return { success: true }
  } catch (error: any) {
    const paymentError = createPaymentError(error, {
      userId,
      subscriptionType,
      amount,
      currency,
    })
    logPaymentError(paymentError)
    return { success: false, error: paymentError.userMessage }
  }
}

/**
 * Activate a pending subscription (e.g. after Alipay/WeChat callback or bank approval).
 * Updates status to 'active', syncs profile, sends notification.
 */
export async function activatePendingSubscription({
  subscriptionId,
  provider,
  providerRef,
  paidAmount,
  currency,
  supabaseAdmin,
}: {
  subscriptionId: string
  provider: 'alipay' | 'wechat' | 'bank'
  providerRef: string
  paidAmount: number
  currency: string
  supabaseAdmin: import('@supabase/supabase-js').SupabaseClient
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, subscription_type, subscription_tier, amount, status')
      .eq('id', subscriptionId)
      .single()

    if (subErr || !sub) {
      return { success: false, error: 'Subscription not found' }
    }
    if (sub.status !== 'pending') {
      logIdempotencyHit('subscription', {
        subscriptionId,
        provider,
        providerRef,
      })
      return { success: true }
    }

    const { data: existingTx } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, status')
      .eq('provider', provider)
      .eq('provider_ref', providerRef)
      .eq('type', 'subscription')
      .eq('related_id', subscriptionId)
      .maybeSingle()

    if (existingTx?.status === 'paid') {
      return { success: true }
    }

    const amountUsd = parseFloat(String(sub.amount))
    const expectedInPaymentCurrency = convertCurrency(amountUsd, 'USD', currency as Currency)
    if (Math.abs(paidAmount - expectedInPaymentCurrency) > 0.02) {
      return { success: false, error: `Amount mismatch: expected ${expectedInPaymentCurrency} ${currency}, got ${paidAmount}` }
    }

    if (!existingTx) {
      await supabaseAdmin.from('payment_transactions').insert({
        type: 'subscription',
        provider,
        provider_ref: providerRef,
        amount: paidAmount,
        currency,
        status: 'paid',
        related_id: subscriptionId,
        paid_at: new Date().toISOString(),
        metadata: { subscription_type: sub.subscription_type },
      })
    } else {
      await supabaseAdmin
        .from('payment_transactions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', existingTx.id)
    }

    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('id', subscriptionId)

    const { error: syncError } = await supabaseAdmin.rpc('sync_profile_subscription_derived', {
      p_user_id: sub.user_id,
    })
    if (syncError) {
      logPayment(LogLevel.ERROR, 'Error syncing profile after activating subscription', {
        subscriptionId,
        userId: sub.user_id,
        error: syncError.message,
      })
    }

    if (sub.subscription_type === 'seller') {
      await enableSellerPayment(sub.user_id, supabaseAdmin)
    }

    // Create notification (use content_key for i18n)
    await supabaseAdmin.from('notifications').insert({
      user_id: sub.user_id,
      type: 'system',
      title: 'Subscription Activated',
      content: `Your ${sub.subscription_type} subscription has been activated successfully`,
      related_type: 'user',
      link: '/subscription/manage',
      content_key: 'subscription_renewed',
      content_params: {
        subscriptionType: sub.subscription_type,
        subscriptionTier: sub.subscription_tier?.toString() || '',
      },
    })

    logPaymentSuccess('subscription', {
      subscriptionId,
      userId: sub.user_id,
      subscriptionType: sub.subscription_type,
      amount: paidAmount,
      currency,
      paymentMethod: provider,
    })

    logAudit({
      action: 'subscription_payment_success',
      userId: sub.user_id,
      resourceId: subscriptionId,
      resourceType: 'subscription',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        planId: sub.subscription_type,
        subscriptionTier: sub.subscription_tier?.toString() ?? undefined,
        amount: paidAmount,
        currency,
      },
    })

    return { success: true }
  } catch (e: any) {
    logPayment(LogLevel.ERROR, 'activatePendingSubscription error', {
      subscriptionId,
      provider,
      error: e.message || 'Unknown error',
    })
    return { success: false, error: e.message || 'Unknown error' }
  }
}
