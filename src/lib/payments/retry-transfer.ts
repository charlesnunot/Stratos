/**
 * Retry failed payment transfers
 * Provides functionality to retry transfers that have failed but haven't exceeded max retries
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { transferToSeller, TransferToSellerParams } from './transfer-to-seller'

interface RetryTransferParams {
  transferId: string
  supabaseAdmin: SupabaseClient
}

/**
 * Retry a failed transfer
 */
export async function retryTransfer({
  transferId,
  supabaseAdmin,
}: RetryTransferParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Get transfer record
    const { data: transfer, error: transferError } = await supabaseAdmin
      .from('payment_transfers')
      .select('*')
      .eq('id', transferId)
      .single()

    if (transferError || !transfer) {
      return { success: false, error: 'Transfer not found' }
    }

    // Check if transfer can be retried
    if (transfer.status !== 'failed') {
      return { success: false, error: `Transfer is not in failed status (current: ${transfer.status})` }
    }

    const retryCount = transfer.retry_count || 0
    const maxRetries = transfer.max_retries || 3

    if (retryCount >= maxRetries) {
      return { success: false, error: `Max retries (${maxRetries}) already reached` }
    }

    // Prepare transfer parameters
    const transferParams: TransferToSellerParams = {
      sellerId: transfer.seller_id,
      amount: transfer.amount,
      currency: transfer.currency,
      paymentMethod: transfer.transfer_method as any,
      paymentTransactionId: transfer.payment_transaction_id || undefined,
      orderId: (transfer.metadata as any)?.order_id,
      supabaseAdmin,
    }

    // Retry the transfer
    const result = await transferToSeller(transferParams)

    return {
      success: result.success,
      error: result.error,
    }
  } catch (error: any) {
    console.error('Retry transfer error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error during retry',
    }
  }
}

/**
 * Find and retry all eligible failed transfers
 */
export async function retryFailedTransfers(
  supabaseAdmin: SupabaseClient,
  limit: number = 10
): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    // Get failed transfers that can be retried
    const { data: failedTransfers, error } = await supabaseAdmin
      .from('payment_transfers')
      .select('id, retry_count, max_retries')
      .eq('status', 'failed')
      .order('created_at', { ascending: true })
      .limit(limit)

    // Filter transfers that haven't exceeded max retries
    const eligibleTransfers = (failedTransfers || []).filter(
      (transfer) => (transfer.retry_count || 0) < (transfer.max_retries || 3)
    )

    if (error) {
      console.error('Error fetching failed transfers:', error)
      return { success: 0, failed: 0, errors: [error.message] }
    }

    if (!eligibleTransfers || eligibleTransfers.length === 0) {
      return { success: 0, failed: 0, errors: [] }
    }

    let successCount = 0
    let failedCount = 0
    const errors: string[] = []

    // Retry each transfer
    for (const transfer of eligibleTransfers) {
      const result = await retryTransfer({
        transferId: transfer.id,
        supabaseAdmin,
      })

      if (result.success) {
        successCount++
      } else {
        failedCount++
        if (result.error) {
          errors.push(`Transfer ${transfer.id}: ${result.error}`)
        }
      }
    }

    return {
      success: successCount,
      failed: failedCount,
      errors,
    }
  } catch (error: any) {
    console.error('Retry failed transfers error:', error)
    return {
      success: 0,
      failed: 0,
      errors: [error.message || 'Unknown error'],
    }
  }
}
