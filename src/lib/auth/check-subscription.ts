/**
 * Unified subscription status check functions
 * Provides consistent subscription permission checking across the application
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubscriptionCheckResult {
  hasActive: boolean
  subscription: any | null
}

export async function checkSubscriptionStatus(
  userId: string,
  subscriptionType: 'tip' | 'seller' | 'affiliate',
  supabaseAdmin: SupabaseClient
): Promise<SubscriptionCheckResult> {
  const { data: subscription, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('subscription_type', subscriptionType)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .single()

  return {
    hasActive: !!subscription && !error,
    subscription: subscription || null,
  }
}

export async function checkSellerPermission(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ hasPermission: boolean; reason?: string }> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('subscription_type, role, seller_type')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { hasPermission: false, reason: 'User profile not found' }
  }

  const p = profile as { seller_subscription_active?: boolean; role?: string; seller_type?: string }
  if (p.seller_type === 'direct') {
    return { hasPermission: true }
  }

  if (p.seller_subscription_active !== true && p.role !== 'seller') {
    return { hasPermission: false, reason: 'User is not a seller' }
  }

  const { hasActive } = await checkSubscriptionStatus(userId, 'seller', supabaseAdmin)
  if (!hasActive) {
    return { hasPermission: false, reason: 'Seller subscription expired or not found' }
  }

  return { hasPermission: true }
}

export async function checkAffiliatePermission(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ hasPermission: boolean; reason?: string }> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('user_origin, internal_affiliate_enabled, payment_provider, payment_account_id, seller_payout_eligibility')
    .eq('id', userId)
    .single()

  const p = profile as { 
    user_origin?: string
    internal_affiliate_enabled?: boolean
    payment_provider?: string
    payment_account_id?: string
    seller_payout_eligibility?: string
  } | null
  
  if (!p) {
    return { hasPermission: false, reason: 'User profile not found' }
  }
  
  if (p.user_origin === 'internal' && p.internal_affiliate_enabled) {
    return { hasPermission: true }
  }

  const { hasActive } = await checkSubscriptionStatus(userId, 'affiliate', supabaseAdmin)
  if (!hasActive) {
    return { hasPermission: false, reason: 'Affiliate subscription expired or not found' }
  }

  const hasPaymentAccount = !!(p.payment_provider && p.payment_account_id)
  if (!hasPaymentAccount) {
    return { hasPermission: false, reason: 'No payment account bound' }
  }
  
  if (p.seller_payout_eligibility === 'blocked') {
    return { hasPermission: false, reason: 'Payment account is blocked' }
  }

  return { hasPermission: true }
}

export async function checkTipPermission(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ hasPermission: boolean; reason?: string }> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tip_enabled, user_origin, internal_tip_enabled, payment_provider, payment_account_id, seller_payout_eligibility')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { hasPermission: false, reason: 'User profile not found' }
  }

  const p = profile as { 
    tip_enabled?: boolean
    user_origin?: string
    internal_tip_enabled?: boolean
    payment_provider?: string
    payment_account_id?: string
    seller_payout_eligibility?: string
  }
  
  if (p.user_origin === 'internal' && p.internal_tip_enabled) {
    return { hasPermission: true }
  }

  if (!p.tip_enabled) {
    return { hasPermission: false, reason: 'Tip feature not enabled' }
  }

  const { hasActive } = await checkSubscriptionStatus(userId, 'tip', supabaseAdmin)
  if (!hasActive) {
    return { hasPermission: false, reason: 'Tip subscription expired or not found' }
  }

  const hasPaymentAccount = !!(p.payment_provider && p.payment_account_id)
  if (!hasPaymentAccount) {
    return { hasPermission: false, reason: 'No payment account bound' }
  }
  
  if (p.seller_payout_eligibility === 'blocked') {
    return { hasPermission: false, reason: 'Payment account is blocked' }
  }

  return { hasPermission: true }
}
