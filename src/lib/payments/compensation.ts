/**
 * Compensation mechanism for payment processing
 * Detects and handles cases where payment succeeded but transfer failed
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { transferToSeller, TransferToSellerParams } from './transfer-to-seller'

interface CompensationRecord {
  id: string
  order_id: string
  seller_id: string
  amount: number
  currency: string
  payment_method: string
  transfer_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
}

/**
 * Detect orders that need compensation (payment succeeded but transfer failed)
 */
export async function detectCompensationNeeded(
  supabaseAdmin: SupabaseClient,
  limit: number = 50
): Promise<CompensationRecord[]> {
  try {
    // Find orders that are paid but have failed transfers
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        seller_id,
        total_amount,
        currency,
        payment_method,
        payment_transfers!inner(
          id,
          status,
          retry_count,
          max_retries,
          error_message
        )
      `)
      .eq('payment_status', 'paid')
      .eq('payment_transfers.status', 'failed')
      .gte('payment_transfers.retry_count', supabaseAdmin.from('payment_transfers').select('max_retries').single() || 3)
      .limit(limit)

    if (error) {
      console.error('Error detecting compensation needed:', error)
      return []
    }

    if (!orders) {
      return []
    }

    // Transform to compensation records
    const compensations: CompensationRecord[] = []
    for (const order of orders) {
      const transfer = (order as any).payment_transfers?.[0]
      if (transfer) {
        compensations.push({
          id: transfer.id,
          order_id: order.id,
          seller_id: order.seller_id || '',
          amount: order.total_amount,
          currency: order.currency || 'USD',
          payment_method: order.payment_method || 'unknown',
          transfer_id: transfer.id,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
      }
    }

    return compensations
  } catch (error: any) {
    console.error('Detect compensation needed error:', error)
    return []
  }
}

/**
 * Create compensation record
 */
export async function createCompensationRecord(
  orderId: string,
  transferId: string,
  reason: string,
  supabaseAdmin: SupabaseClient
): Promise<{ success: boolean; compensationId?: string; error?: string }> {
  try {
    // Get order and transfer details
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('seller_id, total_amount, currency, payment_method')
      .eq('id', orderId)
      .single()

    if (!order) {
      return { success: false, error: 'Order not found' }
    }

    // Check if compensation record already exists
    const { data: existing } = await supabaseAdmin
      .from('payment_compensations')
      .select('id')
      .eq('order_id', orderId)
      .eq('transfer_id', transferId)
      .single()

    if (existing) {
      return { success: true, compensationId: existing.id }
    }

    // Create compensation record
    const { data: compensation, error: compError } = await supabaseAdmin
      .from('payment_compensations')
      .insert({
        order_id: orderId,
        transfer_id: transferId,
        seller_id: order.seller_id,
        amount: order.total_amount,
        currency: order.currency || 'USD',
        payment_method: order.payment_method,
        reason: reason,
        status: 'pending',
      })
      .select()
      .single()

    if (compError) {
      return { success: false, error: `Failed to create compensation: ${compError.message}` }
    }

    return { success: true, compensationId: compensation.id }
  } catch (error: any) {
    console.error('Create compensation record error:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Process compensation transfer
 */
export async function processCompensation(
  compensationId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get compensation record
    const { data: compensation, error: compError } = await supabaseAdmin
      .from('payment_compensations')
      .select('*')
      .eq('id', compensationId)
      .single()

    if (compError || !compensation) {
      return { success: false, error: 'Compensation record not found' }
    }

    if (compensation.status !== 'pending') {
      return { success: false, error: `Compensation is not in pending status (current: ${compensation.status})` }
    }

    // Update status to processing
    await supabaseAdmin
      .from('payment_compensations')
      .update({ status: 'processing' })
      .eq('id', compensationId)

    // Get order to find payment transaction
    const { data: paymentTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('id')
      .eq('related_id', compensation.order_id)
      .eq('type', 'order')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Attempt transfer
    const transferParams: TransferToSellerParams = {
      sellerId: compensation.seller_id,
      amount: compensation.amount,
      currency: compensation.currency,
      paymentMethod: compensation.payment_method as any,
      paymentTransactionId: paymentTransaction?.id,
      orderId: compensation.order_id,
      supabaseAdmin,
    }

    const transferResult = await transferToSeller(transferParams)

    // Update compensation record
    if (transferResult.success) {
      await supabaseAdmin
        .from('payment_compensations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          transfer_id: transferResult.transferId,
        })
        .eq('id', compensationId)

      return { success: true }
    } else {
      await supabaseAdmin
        .from('payment_compensations')
        .update({
          status: 'failed',
          error_message: transferResult.error,
        })
        .eq('id', compensationId)

      return { success: false, error: transferResult.error }
    }
  } catch (error: any) {
    console.error('Process compensation error:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}
