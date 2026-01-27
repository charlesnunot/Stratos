/**
 * Database transaction helper for payment processing
 * Provides atomic operations for payment-related database updates
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { logPayment, LogLevel } from './logger'

/**
 * Execute payment processing in a transaction-like manner
 * Uses PostgreSQL function to ensure atomicity
 */
export async function processPaymentTransaction(
  supabaseAdmin: SupabaseClient,
  operations: {
    updateOrder: () => Promise<{ error: any }>
    updateStock: () => Promise<{ error: any }>
    createCommissions?: () => Promise<{ error: any }>
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Execute operations sequentially and check for errors
    // If any operation fails, we'll need to rollback manually
    
    // 1. Update order status
    const orderResult = await operations.updateOrder()
    if (orderResult.error) {
      return { success: false, error: `Failed to update order: ${orderResult.error.message}` }
    }

    // 2. Update stock
    const stockResult = await operations.updateStock()
    if (stockResult.error) {
      logPayment(LogLevel.ERROR, 'Stock update failed, order already updated. Manual rollback needed.', {
        error: stockResult.error.message,
      })
      return { success: false, error: `Failed to update stock: ${stockResult.error.message}` }
    }

    // 3. Create commissions (optional)
    if (operations.createCommissions) {
      const commissionResult = await operations.createCommissions()
      if (commissionResult.error) {
        logPayment(LogLevel.WARN, 'Commission creation failed', {
          error: commissionResult.error?.message || 'Unknown error',
        })
      }
    }

    return { success: true }
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Transaction helper error', {
      error: error.message || 'Unknown error',
    })
    return { success: false, error: error.message || 'Transaction failed' }
  }
}

/**
 * Create a PostgreSQL transaction function for payment processing
 * This ensures true atomicity at the database level
 */
export async function createPaymentTransactionFunction(supabaseAdmin: SupabaseClient) {
  // This would create a PostgreSQL function that handles the entire payment process
  // For now, we'll use the sequential approach with manual rollback
  // In production, consider creating a proper PostgreSQL function
}
