/**
 * Auto-recovery check when order is completed
 * Checks if unfilled orders have dropped below subscription tier and recovers payment
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { checkAutoRecovery } from '../deposits/payment-control'

/**
 * Check and recover payment when order is completed
 */
export async function checkRecoveryOnOrderCompletion(
  orderId: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  try {
    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('seller_id, order_status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('Order not found:', orderError)
      return
    }

    // Only check if order is completed
    if (order.order_status !== 'completed') {
      return
    }

    // Check if payment can be auto-recovered
    await checkAutoRecovery(order.seller_id, supabaseAdmin)
  } catch (error: any) {
    console.error('checkRecoveryOnOrderCompletion error:', error)
  }
}
