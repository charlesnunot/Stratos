/**
 * Unified subscription status check functions
 * Provides consistent subscription permission checking across the application
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubscriptionCheckResult {
  hasActive: boolean
  subscription: any | null
}

/**
 * Check if user has an active subscription of a specific type
 */
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

/**
 * Check seller permission (including subscription status)
 */
export async function checkSellerPermission(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ hasPermission: boolean; reason?: string }> {
  // 1. Check profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('subscription_type, role')
    .eq('id', userId)
    .single()

  if (!profile) {
    return { hasPermission: false, reason: 'User profile not found' }
  }

  if (profile.subscription_type !== 'seller' && profile.role !== 'seller') {
    return { hasPermission: false, reason: 'User is not a seller' }
  }

  // 2. Check subscription status
  const { hasActive } = await checkSubscriptionStatus(userId, 'seller', supabaseAdmin)
  if (!hasActive) {
    return { hasPermission: false, reason: 'Seller subscription expired or not found' }
  }

  return { hasPermission: true }
}

/**
 * Check affiliate permission (including subscription status)
 */
export async function checkAffiliatePermission(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ hasPermission: boolean; reason?: string }> {
  const { hasActive } = await checkSubscriptionStatus(userId, 'affiliate', supabaseAdmin)
  if (!hasActive) {
    return { hasPermission: false, reason: 'Affiliate subscription expired or not found' }
  }

  return { hasPermission: true }
}

/**
 * Check tip permission (including subscription status)
 */
export async function checkTipPermission(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ hasPermission: boolean; reason?: string }> {
  // 1. Check profile tip_enabled flag
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tip_enabled')
    .eq('id', userId)
    .single()

  if (!profile?.tip_enabled) {
    return { hasPermission: false, reason: 'Tip feature not enabled' }
  }

  // 2. Check subscription status
  const { hasActive } = await checkSubscriptionStatus(userId, 'tip', supabaseAdmin)
  if (!hasActive) {
    return { hasPermission: false, reason: 'Tip subscription expired or not found' }
  }

  return { hasPermission: true }
}
