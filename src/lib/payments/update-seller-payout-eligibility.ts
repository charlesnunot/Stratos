/**
 * Update seller payout eligibility service
 * 
 * IRON LAW: Any API / cron / webhook MUST NOT directly UPDATE seller_payout_eligibility.
 * They can ONLY write through this service.
 * 
 * This is a physical lock to prevent future developers from "directly updating for convenience".
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { calculateSellerPayoutEligibility, SellerPayoutEligibility } from './calculate-seller-payout-eligibility'

export interface UpdateEligibilityParams {
  sellerId: string
  supabaseAdmin: SupabaseClient
}

export interface UpdateEligibilityResult {
  success: boolean
  eligibility: SellerPayoutEligibility
  error?: string
}

/**
 * Update seller payout eligibility by recalculating
 * 
 * This is the ONLY way to update seller_payout_eligibility.
 * 
 * Implementation:
 * 1. Call calculateSellerPayoutEligibility to get the new value
 * 2. Update profiles table via database function (physical lock)
 * 
 * @param params - Seller ID and Supabase admin client
 * @returns Update result with new eligibility status
 */
export async function updateSellerPayoutEligibility({
  sellerId,
  supabaseAdmin,
}: UpdateEligibilityParams): Promise<UpdateEligibilityResult> {
  try {
    // Calculate new eligibility
    const eligibility = await calculateSellerPayoutEligibility({
      sellerId,
      supabaseAdmin,
    })

    // Update via database function (physical lock)
    const { data, error } = await supabaseAdmin.rpc('update_seller_payout_eligibility', {
      p_seller_id: sellerId,
    })

    if (error) {
      console.error('Error updating seller payout eligibility:', error)
      return {
        success: false,
        eligibility,
        error: error.message,
      }
    }

    // Verify the update was successful
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('seller_payout_eligibility')
      .eq('id', sellerId)
      .single()

    if (fetchError || !profile) {
      console.error('Error verifying eligibility update:', fetchError)
      return {
        success: false,
        eligibility,
        error: 'Failed to verify update',
      }
    }

    if (profile.seller_payout_eligibility !== eligibility) {
      console.error('Eligibility mismatch after update:', {
        expected: eligibility,
        actual: profile.seller_payout_eligibility,
      })
      return {
        success: false,
        eligibility,
        error: 'Eligibility mismatch after update',
      }
    }

    return {
      success: true,
      eligibility,
    }
  } catch (error: any) {
    console.error('Exception updating seller payout eligibility:', error)
    return {
      success: false,
      eligibility: 'blocked', // Default to blocked on error
      error: error.message || 'Unknown error',
    }
  }
}
