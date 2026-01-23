/**
 * Unified service layer for processing subscription payments
 * Supports tiered seller subscriptions, affiliate subscriptions, and tip feature subscriptions
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { enableSellerPayment } from '../deposits/payment-control'
import { logPaymentSuccess, logPaymentFailure, logIdempotencyHit } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'

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
    const { error: subError } = await supabaseAdmin.from('subscriptions').insert({
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

    // Update user profile
    const updateData: any = {
      subscription_type: subscriptionType,
      subscription_expires_at: expiresAt.toISOString(),
    }

    // For seller subscriptions, update seller_subscription_tier
    if (subscriptionType === 'seller' && subscriptionTier) {
      updateData.seller_subscription_tier = subscriptionTier
      updateData.role = 'seller'
    }

    // For tip subscriptions, update tip_enabled
    // Note: The database trigger will also handle this, but we update it here for consistency
    if (subscriptionType === 'tip') {
      updateData.tip_enabled = true
    }

    await supabaseAdmin.from('profiles').update(updateData).eq('id', userId)

    // If seller subscription, check if payment should be enabled
    if (subscriptionType === 'seller') {
      // Enable payment if it was disabled due to deposit requirement
      await enableSellerPayment(userId, supabaseAdmin)
    }

    // Create notification
    const tierText = subscriptionTier ? ` (${subscriptionTier} USD档位)` : ''
    let subscriptionName = '订阅'
    if (subscriptionType === 'seller') {
      subscriptionName = '卖家订阅'
    } else if (subscriptionType === 'affiliate') {
      subscriptionName = '带货者订阅'
    } else if (subscriptionType === 'tip') {
      subscriptionName = '打赏功能订阅'
    }
    
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type: 'system',
      title: '订阅激活成功',
      content: `您的${subscriptionName}已成功激活${tierText}`,
      related_type: 'user',
      link: '/subscription/manage',
    })

    logPaymentSuccess('subscription', {
      userId,
      subscriptionType,
      amount,
      currency,
      paymentMethod,
      subscriptionTier: subscriptionTier?.toString(),
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
