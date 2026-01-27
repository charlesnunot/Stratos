/**
 * Debt collection service
 * Handles automatic debt collection from deposits and payouts
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface CollectDebtFromDepositResult {
  success: boolean
  collectedCount: number
  totalCollected: number
  error?: string
}

export interface CollectDebtFromPayoutResult {
  success: boolean
  actualPayoutAmount: number
  deductedDebtAmount: number
  remainingDebt: number
  error?: string
}

/**
 * Collect debt from seller's deposit balance
 * Automatically deducts pending debts from available deposits
 */
export async function collectDebtFromDeposit(
  sellerId: string,
  supabaseAdmin: SupabaseClient
): Promise<CollectDebtFromDepositResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('collect_debt_from_deposit', {
      p_seller_id: sellerId,
    })

    if (error) {
      console.error('Error collecting debt from deposit:', error)
      return {
        success: false,
        collectedCount: 0,
        totalCollected: 0,
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        collectedCount: 0,
        totalCollected: 0,
        error: 'No data returned from function',
      }
    }

    const result = data[0]

    // Send notification to seller if debt was collected
    if (result.success && result.collected_count > 0) {
      await supabaseAdmin.from('notifications').insert({
        user_id: sellerId,
        type: 'system',
        title: '债务已从保证金扣除',
        content: `您的债务（${result.total_collected.toFixed(2)} USD）已从保证金中自动扣除。`,
        related_type: 'order',
        link: '/seller/debts',
      })
    }

    return {
      success: result.success,
      collectedCount: result.collected_count || 0,
      totalCollected: parseFloat(result.total_collected) || 0,
      error: result.error_message || undefined,
    }
  } catch (error: any) {
    console.error('collectDebtFromDeposit error:', error)
    return {
      success: false,
      collectedCount: 0,
      totalCollected: 0,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Collect debt from seller's payout
 * Deducts pending debts from payout amount before transferring to seller
 */
export async function collectDebtFromPayout(
  sellerId: string,
  payoutAmount: number,
  payoutCurrency: string,
  supabaseAdmin: SupabaseClient
): Promise<CollectDebtFromPayoutResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('collect_debt_from_payout', {
      p_seller_id: sellerId,
      p_payout_amount: payoutAmount,
      p_payout_currency: payoutCurrency,
    })

    if (error) {
      console.error('Error collecting debt from payout:', error)
      return {
        success: false,
        actualPayoutAmount: payoutAmount,
        deductedDebtAmount: 0,
        remainingDebt: 0,
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        actualPayoutAmount: payoutAmount,
        deductedDebtAmount: 0,
        remainingDebt: 0,
        error: 'No data returned from function',
      }
    }

    const result = data[0]

    // Send notification to seller if debt was deducted
    if (result.deducted_debt_amount > 0) {
      await supabaseAdmin.from('notifications').insert({
        user_id: sellerId,
        type: 'system',
        title: '收款中已扣除债务',
        content: `您的收款（${payoutAmount.toFixed(2)} ${payoutCurrency}）中已扣除债务 ${result.deducted_debt_amount.toFixed(2)} ${payoutCurrency}。实际收款：${result.actual_payout_amount.toFixed(2)} ${payoutCurrency}。`,
        related_type: 'order',
        link: '/seller/debts',
      })
    }

    return {
      success: true,
      actualPayoutAmount: parseFloat(result.actual_payout_amount) || payoutAmount,
      deductedDebtAmount: parseFloat(result.deducted_debt_amount) || 0,
      remainingDebt: parseFloat(result.remaining_debt) || 0,
    }
  } catch (error: any) {
    console.error('collectDebtFromPayout error:', error)
    return {
      success: false,
      actualPayoutAmount: payoutAmount,
      deductedDebtAmount: 0,
      remainingDebt: 0,
      error: error.message || 'Unknown error',
    }
  }
}
