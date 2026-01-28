/**
 * Validate if seller is ready to accept payments
 * 
 * This function performs the "hard check" before any payment creation.
 * 
 * Validation checks (all must pass):
 * 1. Seller exists
 * 2. Seller subscription is valid
 * 3. Payment account is bound
 * 4. seller_payout_eligibility = 'eligible' (single source of truth)
 * 
 * State machine iron law:
 * - Only 'eligible' allows payment creation
 * - 'pending_review' and 'blocked' both prohibit payment creation
 * - This is a three-state judgment, not ambiguous
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { logPayment, LogLevel } from './logger'

export interface ValidationResult {
  canAcceptPayment: boolean
  reason?: string
  paymentProvider?: string
  accountId?: string
  eligibility?: 'eligible' | 'blocked' | 'pending_review'
}

export interface ValidateParams {
  sellerId: string
  supabaseAdmin: SupabaseClient
  paymentMethod?: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank' // Optional: check if seller supports this specific payment method
}

/**
 * Validate if seller is ready to accept payments
 * 
 * This is called:
 * 1. Before order creation (first check)
 * 2. Before payment session creation (second check, more critical)
 * 
 * @param params - Seller ID and Supabase admin client
 * @returns Validation result
 */
export async function validateSellerPaymentReady({
  sellerId,
  supabaseAdmin,
  paymentMethod,
}: ValidateParams): Promise<ValidationResult> {
  try {
    // Check 1: Seller exists
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, payment_provider, payment_account_id, seller_payout_eligibility')
      .eq('id', sellerId)
      .single()

    if (profileError || !profile) {
      return {
        canAcceptPayment: false,
        reason: 'Seller not found',
      }
    }

    // Check 2: Seller subscription is valid
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, subscription_type, status, expires_at')
      .eq('user_id', sellerId)
      .eq('subscription_type', 'seller')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subscriptionError) {
      return {
        canAcceptPayment: false,
        reason: 'Error checking subscription',
      }
    }

    if (!subscription) {
      return {
        canAcceptPayment: false,
        reason: 'Seller subscription is invalid or expired',
        eligibility: profile.seller_payout_eligibility ?? undefined,
      }
    }

    // Check 3: Payment account is bound
    if (!profile.payment_provider || !profile.payment_account_id) {
      return {
        canAcceptPayment: false,
        reason: 'Payment account not bound',
        eligibility: profile.seller_payout_eligibility ?? undefined,
      }
    }

    // Check 3.5: Payment method match (if paymentMethod is provided)
    // In buyer-to-seller direct payment model, payment method must match seller's payment provider
    if (paymentMethod && profile.payment_provider !== paymentMethod) {
      return {
        canAcceptPayment: false,
        reason: `SELLER_PAYMENT_METHOD_MISMATCH: Seller uses ${profile.payment_provider}, but ${paymentMethod} was requested`,
        paymentProvider: profile.payment_provider,
        accountId: profile.payment_account_id,
        eligibility: profile.seller_payout_eligibility ?? undefined,
      }
    }

    // Check 4: Platform-side payout eligibility (single source of truth)
    // Iron law: Only 'eligible' allows payment creation
    if (profile.seller_payout_eligibility !== 'eligible') {
      const eligibility = profile.seller_payout_eligibility as 'blocked' | 'pending_review' | null
      let reason = 'Seller payout eligibility is not eligible'
      
      if (eligibility === 'blocked') {
        reason = 'Seller account is blocked (risk control / violation / subscription expired)'
      } else if (eligibility === 'pending_review') {
        reason = 'Seller payment account is pending review (status incomplete / waiting for webhook)'
      } else {
        reason = 'Seller payout eligibility is not set'
      }

      return {
        canAcceptPayment: false,
        reason,
        paymentProvider: profile.payment_provider,
        accountId: profile.payment_account_id,
        eligibility: eligibility || 'pending_review',
      }
    }

    // All checks passed
    return {
      canAcceptPayment: true,
      paymentProvider: profile.payment_provider,
      accountId: profile.payment_account_id,
      eligibility: 'eligible',
    }
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Exception validating seller payment readiness', {
      sellerId,
      error: error.message || 'Unknown error',
    })
    return {
      canAcceptPayment: false,
      reason: error.message || 'Unknown error during validation',
    }
  }
}
