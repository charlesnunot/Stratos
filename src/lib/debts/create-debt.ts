/**
 * Create seller debt when platform advances refund
 */

import { SupabaseClient } from '@supabase/supabase-js'

export async function createSellerDebt(
  sellerId: string,
  orderId: string,
  disputeId: string | undefined,
  refundId: string,
  amount: number,
  currency: string,
  reason: string,
  supabaseAdmin: SupabaseClient
): Promise<string> {
  try {
    const { data: debt, error: debtError } = await supabaseAdmin.rpc('create_seller_debt', {
      p_seller_id: sellerId,
      p_order_id: orderId,
      p_dispute_id: disputeId || null,
      p_refund_id: refundId,
      p_amount: amount,
      p_currency: currency,
      p_reason: reason,
    })

    if (debtError) {
      console.error('Error creating seller debt:', debtError)
      throw debtError
    }

    return debt as string
  } catch (error: any) {
    console.error('createSellerDebt error:', error)
    throw error
  }
}
