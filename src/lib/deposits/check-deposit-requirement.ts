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

const DEFAULT_RESULT: DepositCheckResult = {
  requiresDeposit: false,
  requiredAmount: 0,
  currentTier: 0,
  suggestedTier: 0,
  reason: 'Deposit check unavailable',
}

function isFunctionNotExistError(error: { code?: string; message?: string }): boolean {
  const code = error?.code
  const msg = (error?.message ?? '').toLowerCase()
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    msg.includes('does not exist') ||
    msg.includes('could not find') ||
    (msg.includes('function') && msg.includes('not found'))
  )
}

export async function checkSellerDepositRequirement(
  sellerId: string,
  newOrderAmount: number,
  supabaseAdmin: SupabaseClient,
  newOrderCurrency: string = 'USD'
): Promise<DepositCheckResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_seller_deposit_requirement', {
      p_seller_id: sellerId,
      p_new_order_amount: newOrderAmount,
      p_new_order_currency: newOrderCurrency,
    })

    if (error) {
      console.error('[check-deposit-requirement] RPC error:', {
        sellerId,
        newOrderAmount,
        code: error.code,
        message: error.message,
        details: error.details,
      })

      if (isFunctionNotExistError(error)) {
        console.warn(
          '[check-deposit-requirement] Database function check_seller_deposit_requirement may not exist. ' +
            'Create it via migrations. Returning safe default (no deposit required).'
        )
        return {
          ...DEFAULT_RESULT,
          reason: 'Deposit check unavailable (database function missing). Fix database configuration.',
        }
      }

      const err = new Error(
        `Deposit check failed: ${error.message} (code: ${error.code ?? 'unknown'})`
      ) as Error & { code?: string }
      err.code = error.code
      throw err
    }

    if (!data || data.length === 0) {
      console.warn('[check-deposit-requirement] Empty RPC result:', { sellerId, newOrderAmount })
      return {
        ...DEFAULT_RESULT,
        reason: 'Unable to check deposit requirement (empty result)',
      }
    }

    const result = data[0]
    return {
      requiresDeposit: Boolean(result.requires_deposit),
      requiredAmount: parseFloat(result.required_amount) || 0,
      currentTier: parseFloat(result.current_tier) || 0,
      suggestedTier: parseFloat(result.suggested_tier) || 0,
      reason: result.reason ?? 'OK',
    }
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string }
    if (err?.message?.startsWith('Deposit check failed:')) {
      throw error
    }
    console.error('[check-deposit-requirement] Unexpected error:', {
      sellerId,
      newOrderAmount,
      message: err?.message,
      code: err?.code,
    })
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
