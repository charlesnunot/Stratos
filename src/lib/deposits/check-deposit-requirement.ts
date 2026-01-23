/**
 * Real-time deposit requirement check
 * Checks if seller needs to pay deposit before order creation or payment
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface DepositCheckResult {
  requiresDeposit: boolean
  requiredAmount: number
  currentTier: number
  suggestedTier: number
  reason: string
}

export async function checkSellerDepositRequirement(
  sellerId: string,
  newOrderAmount: number,
  supabaseAdmin: SupabaseClient
): Promise<DepositCheckResult> {
  try {
    // Call database function with lock to prevent concurrent orders
    const { data, error } = await supabaseAdmin.rpc('check_seller_deposit_requirement', {
      p_seller_id: sellerId,
      p_new_order_amount: newOrderAmount,
    })

    if (error) {
      console.error('Error checking deposit requirement:', error)
      throw error
    }

    if (!data || data.length === 0) {
      return {
        requiresDeposit: false,
        requiredAmount: 0,
        currentTier: 0,
        suggestedTier: 0,
        reason: 'Unable to check deposit requirement',
      }
    }

    const result = data[0]
    return {
      requiresDeposit: result.requires_deposit,
      requiredAmount: parseFloat(result.required_amount) || 0,
      currentTier: parseFloat(result.current_tier) || 0,
      suggestedTier: parseFloat(result.suggested_tier) || 0,
      reason: result.reason || 'OK',
    }
  } catch (error: any) {
    console.error('checkSellerDepositRequirement error:', error)
    throw error
  }
}

/**
 * Get suggested subscription tier based on total amount
 */
export function getSuggestedTier(totalAmount: number): number {
  if (totalAmount <= 10) return 10
  if (totalAmount <= 20) return 20
  if (totalAmount <= 50) return 50
  if (totalAmount <= 100) return 100
  if (totalAmount <= 300) return 300
  return 300 // Highest tier
}
