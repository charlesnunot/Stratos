/**
 * Calculate seller payout eligibility
 * 
 * This is the ONLY function that calculates seller_payout_eligibility.
 * All business logic depends on this result.
 * 
 * State machine definition (iron law):
 * - eligible: Platform explicitly allows seller to receive payments ✅
 * - pending_review: Status incomplete / waiting for webhook / manual review ❌
 * - blocked: Explicitly prohibited (risk control / violation / subscription expired) ❌
 * 
 * Iron law: Except eligible, all other states are considered non-receivable.
 */

import { SupabaseClient } from '@supabase/supabase-js'

export type SellerPayoutEligibility = 'eligible' | 'blocked' | 'pending_review'

export interface CalculateEligibilityParams {
  sellerId: string
  supabaseAdmin: SupabaseClient
}

/**
 * Calculate seller payout eligibility based on:
 * 1. Subscription validity
 * 2. Payment account binding status
 * 3. Payment provider account status (provider_* fields)
 * 4. Risk control rules
 * 
 * @param params - Seller ID and Supabase admin client
 * @returns Eligibility status: eligible, blocked, or pending_review
 */
export async function calculateSellerPayoutEligibility({
  sellerId,
  supabaseAdmin,
}: CalculateEligibilityParams): Promise<SellerPayoutEligibility> {
  try {
    // Use database function for calculation (ensures consistency)
    const { data, error } = await supabaseAdmin.rpc('calculate_seller_payout_eligibility', {
      p_seller_id: sellerId,
    })

    if (error) {
      console.error('Error calculating seller payout eligibility:', error)
      // On error, default to blocked (conservative approach)
      return 'blocked'
    }

    // Validate the result
    const eligibility = data as SellerPayoutEligibility
    if (!['eligible', 'blocked', 'pending_review'].includes(eligibility)) {
      console.error('Invalid eligibility value returned:', eligibility)
      return 'blocked'
    }

    return eligibility
  } catch (error) {
    console.error('Exception calculating seller payout eligibility:', error)
    // On exception, default to blocked (conservative approach)
    return 'blocked'
  }
}
