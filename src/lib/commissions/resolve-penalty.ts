/**
 * Commission penalty resolution service
 * Handles automatic penalty resolution when commission is paid
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface ResolvePenaltyResult {
  success: boolean
  resolvedPenalties: number
  error?: string
}

/**
 * Resolve commission penalty when commission is paid
 * Automatically resolves active penalties and restores seller functionality
 */
export async function resolveCommissionPenalty(
  sellerId: string,
  obligationId: string,
  supabaseAdmin: SupabaseClient
): Promise<ResolvePenaltyResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('resolve_commission_penalty', {
      p_seller_id: sellerId,
      p_obligation_id: obligationId,
    })

    if (error) {
      console.error('Error resolving penalty:', error)
      return {
        success: false,
        resolvedPenalties: 0,
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        resolvedPenalties: 0,
        error: 'No data returned from function',
      }
    }

    const result = data[0]

    // Send notification to seller if penalties were resolved
    if (result.success && result.resolved_penalties > 0) {
      await supabaseAdmin.from('notifications').insert({
        user_id: sellerId,
        type: 'system',
        title: '惩罚已解除',
        content: `您的佣金已支付，${result.resolved_penalties} 个惩罚已自动解除，相关功能已恢复。`,
        related_type: 'commission',
        related_id: obligationId,
        link: '/seller/commissions',
      })
    }

    return {
      success: result.success,
      resolvedPenalties: result.resolved_penalties || 0,
      error: result.error_message || undefined,
    }
  } catch (error: any) {
    console.error('resolveCommissionPenalty error:', error)
    return {
      success: false,
      resolvedPenalties: 0,
      error: error.message || 'Unknown error',
    }
  }
}
