/**
 * Tip limits checking
 * Validates tip amount and daily limit before processing tip payment
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface TipLimitCheckResult {
  allowed: boolean
  reason?: string
}

const MAX_TIP_AMOUNT_CNY = 35.0 // Max 35 CNY per tip
const MAX_DAILY_TIPS = 3 // Max 3 tips per day to same recipient

/**
 * Check tip limits before processing
 */
export async function checkTipLimits(
  tipperId: string,
  recipientId: string,
  amount: number,
  currency: string,
  supabaseAdmin: SupabaseClient
): Promise<TipLimitCheckResult> {
  try {
    // Call database function to check limits
    const { data, error } = await supabaseAdmin.rpc('check_tip_limits', {
      p_tipper_id: tipperId,
      p_recipient_id: recipientId,
      p_amount: amount,
      p_currency: currency,
    })

    if (error) {
      console.error('Error checking tip limits:', error)
      return {
        allowed: false,
        reason: error.message || 'Failed to check tip limits',
      }
    }

    if (!data || data.length === 0) {
      return {
        allowed: false,
        reason: 'Unable to check tip limits',
      }
    }

    const result = data[0]
    return {
      allowed: result.allowed,
      reason: result.reason || undefined,
    }
  } catch (error: any) {
    console.error('checkTipLimits error:', error)
    return {
      allowed: false,
      reason: error.message || 'Unknown error',
    }
  }
}

/**
 * Check if user has tip feature enabled
 */
export async function checkTipEnabled(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_tip_enabled', {
      p_user_id: userId,
    })

    if (error) {
      console.error('Error checking tip enabled:', error)
      return false
    }

    return data === true
  } catch (error: any) {
    console.error('checkTipEnabled error:', error)
    return false
  }
}
