/**
 * Deposit deduction service
 * Handles deducting amounts from seller deposits for various reasons
 * (debt collection, commission payment, etc.)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { Currency } from '@/lib/currency/detect-currency'

export interface DeductFromDepositParams {
  sellerId: string
  amount: number
  currency: Currency
  reason: string
  relatedId: string
  relatedType: 'debt' | 'commission' | 'other' | 'violation'
  supabaseAdmin: SupabaseClient
}

export interface DeductFromDepositResult {
  success: boolean
  deductedAmount: number
  deductedAmountCurrency: Currency
  remainingBalance: number
  error?: string
}

/**
 * Deduct amount from seller's deposit
 * Handles currency conversion if debt currency differs from deposit currency
 */
export async function deductFromDeposit({
  sellerId,
  amount,
  currency,
  reason,
  relatedId,
  relatedType,
  supabaseAdmin,
}: DeductFromDepositParams): Promise<DeductFromDepositResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('deduct_from_deposit', {
      p_seller_id: sellerId,
      p_amount: amount,
      p_amount_currency: currency,
      p_reason: reason,
      p_related_id: relatedId,
      p_related_type: relatedType,
    })

    if (error) {
      console.error('Error deducting from deposit:', error)
      return {
        success: false,
        deductedAmount: 0,
        deductedAmountCurrency: currency,
        remainingBalance: 0,
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        deductedAmount: 0,
        deductedAmountCurrency: currency,
        remainingBalance: 0,
        error: 'No data returned from function',
      }
    }

    const result = data[0]

    // Send notification to seller
    if (result.success) {
      await supabaseAdmin.from('notifications').insert({
        user_id: sellerId,
        type: 'system',
        title: '保证金已扣除',
        content: `您的保证金中已扣除 ${result.deducted_amount.toFixed(2)} ${result.deducted_amount_currency}。原因：${reason}。`,
        related_type: relatedType === 'debt' ? 'order' : relatedType === 'violation' ? 'violation' : 'commission',
        related_id: relatedId,
        link: '/seller/deposit',
      })
    }

    return {
      success: result.success,
      deductedAmount: parseFloat(result.deducted_amount) || 0,
      deductedAmountCurrency: (result.deducted_amount_currency as Currency) || currency,
      remainingBalance: parseFloat(result.remaining_balance) || 0,
      error: result.error_message || undefined,
    }
  } catch (error: any) {
    console.error('deductFromDeposit error:', error)
    return {
      success: false,
      deductedAmount: 0,
      deductedAmountCurrency: currency,
      remainingBalance: 0,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Get seller's available deposit balance
 */
export async function getSellerDepositBalance(
  sellerId: string,
  supabaseAdmin: SupabaseClient
): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_seller_deposit_balance', {
      p_seller_id: sellerId,
    })

    if (error) {
      console.error('Error getting deposit balance:', error)
      return 0
    }

    return parseFloat(data) || 0
  } catch (error: any) {
    console.error('getSellerDepositBalance error:', error)
    return 0
  }
}
