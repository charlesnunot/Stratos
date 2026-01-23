/**
 * Payment control automation
 * Functions to enable/disable seller payment based on deposit requirements
 */

import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Disable payment for all seller's products
 */
export async function disableSellerPayment(
  sellerId: string,
  reason: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('disable_seller_payment', {
      p_seller_id: sellerId,
      p_reason: reason,
    })

    if (error) {
      console.error('Error disabling seller payment:', error)
      throw error
    }
  } catch (error: any) {
    console.error('disableSellerPayment error:', error)
    throw error
  }
}

/**
 * Enable payment for all seller's products
 */
export async function enableSellerPayment(
  sellerId: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('enable_seller_payment', {
      p_seller_id: sellerId,
    })

    if (error) {
      console.error('Error enabling seller payment:', error)
      throw error
    }
  } catch (error: any) {
    console.error('enableSellerPayment error:', error)
    throw error
  }
}

/**
 * Check if payment should be auto-recovered after order completion
 */
export async function checkAutoRecovery(
  sellerId: string,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  try {
    // Get current unfilled orders total
    const { data: unfilledTotal, error: unfilledError } = await supabaseAdmin.rpc(
      'get_unfilled_orders_total',
      {
        p_seller_id: sellerId,
      }
    )

    if (unfilledError) {
      console.error('Error getting unfilled orders total:', unfilledError)
      return false
    }

    // Get seller's current subscription tier
    const { data: depositCredit, error: creditError } = await supabaseAdmin.rpc(
      'get_seller_deposit_credit',
      {
        p_seller_id: sellerId,
      }
    )

    if (creditError) {
      console.error('Error getting deposit credit:', creditError)
      return false
    }

    const total = parseFloat(unfilledTotal) || 0
    const credit = parseFloat(depositCredit) || 0

    // If unfilled orders <= subscription tier, payment can be recovered
    if (total <= credit) {
      // Check if payment is currently disabled
      const { data: products, error: productsError } = await supabaseAdmin
        .from('products')
        .select('payment_enabled')
        .eq('seller_id', sellerId)
        .limit(1)
        .single()

      if (productsError) {
        console.error('Error checking products:', productsError)
        return false
      }

      // If payment is disabled, enable it
      if (products && !products.payment_enabled) {
        await enableSellerPayment(sellerId, supabaseAdmin)
        return true
      }
    }

    return false
  } catch (error: any) {
    console.error('checkAutoRecovery error:', error)
    return false
  }
}
