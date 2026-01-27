/**
 * Unified transfer service layer
 * Handles money transfers to sellers/recipients using different payment methods
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { logTransferInitiated, logTransferSuccess, logTransferFailure } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'
import { collectDebtFromPayout } from '@/lib/debts/collect-debt'

export interface TransferToSellerParams {
  sellerId: string
  amount: number
  currency: string
  paymentTransactionId?: string
  paymentMethod: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  orderId?: string
  supabaseAdmin: SupabaseClient
}

export interface TransferResult {
  success: boolean
  transferId?: string
  transferRef?: string
  error?: string
}

/**
 * Main function to transfer money to seller
 * Automatically selects the appropriate transfer method based on seller's payment accounts
 */
export async function transferToSeller({
  sellerId,
  amount,
  currency,
  paymentTransactionId,
  paymentMethod,
  orderId,
  supabaseAdmin,
}: TransferToSellerParams): Promise<TransferResult> {
  try {
    // Get seller's payment account for this currency and payment method
    const { data: paymentAccount, error: accountError } = await supabaseAdmin
      .rpc('get_seller_payment_account', {
        p_seller_id: sellerId,
        p_currency: currency,
        p_account_type: paymentMethod,
      })

    if (accountError || !paymentAccount || paymentAccount.length === 0) {
      // No payment account found, create a pending transfer record
      const { data: pendingTransfer } = await supabaseAdmin
        .from('payment_transfers')
        .insert({
          seller_id: sellerId,
          amount,
          currency,
          transfer_method: paymentMethod,
          status: 'pending',
          payment_transaction_id: paymentTransactionId,
          metadata: {
            order_id: orderId,
            error: 'No payment account found for seller',
          },
        })
        .select()
        .single()

      return {
        success: false,
        transferId: pendingTransfer?.id,
        error: 'Seller has no verified payment account for this currency and payment method',
      }
    }

    const account = paymentAccount[0]

    // Deduct debt from payout before transferring
    const debtResult = await collectDebtFromPayout(
      sellerId,
      amount,
      currency,
      supabaseAdmin
    )

    // Use actual payout amount after debt deduction
    const actualAmount = debtResult.success 
      ? debtResult.actualPayoutAmount 
      : amount

    // If all amount was deducted for debt, no need to transfer
    if (actualAmount <= 0) {
      return {
        success: true,
        transferId: undefined,
        transferRef: 'debt_deduction_only',
        error: debtResult.deductedDebtAmount > 0 
          ? `All payout amount (${amount} ${currency}) was deducted for debt repayment. Remaining debt: ${debtResult.remainingDebt} ${currency}`
          : undefined,
      }
    }

    // Log transfer initiation
    logTransferInitiated({
      sellerId,
      amount: actualAmount,
      currency,
      paymentMethod,
      orderId,
      originalAmount: amount,
      deductedDebt: debtResult.deductedDebtAmount,
    })

    // Create pending transfer record with actual amount
    const { data: transferRecord, error: transferError } = await supabaseAdmin
      .from('payment_transfers')
      .insert({
        seller_id: sellerId,
        amount: actualAmount,
        currency,
        transfer_method: paymentMethod,
        status: 'processing',
        payment_transaction_id: paymentTransactionId,
        retry_count: 0,
        max_retries: 3,
        metadata: {
          order_id: orderId,
          account_id: account.id,
          original_amount: amount,
          deducted_debt: debtResult.deductedDebtAmount,
          remaining_debt: debtResult.remainingDebt,
        },
      })
      .select()
      .single()

    if (transferError || !transferRecord) {
      return {
        success: false,
        error: `Failed to create transfer record: ${transferError?.message}`,
      }
    }

    // Execute transfer based on payment method
    let transferResult: TransferResult

    switch (paymentMethod) {
      case 'stripe':
        transferResult = await transferViaStripe({
          sellerId,
          amount: actualAmount,
          currency,
          accountInfo: account.account_info,
          transferId: transferRecord.id,
          supabaseAdmin,
        })
        break
      case 'paypal':
        transferResult = await transferViaPayPal({
          sellerId,
          amount: actualAmount,
          currency,
          accountInfo: account.account_info,
          transferId: transferRecord.id,
          supabaseAdmin,
        })
        break
      case 'alipay':
        transferResult = await transferViaAlipay({
          sellerId,
          amount: actualAmount,
          currency,
          accountInfo: account.account_info,
          transferId: transferRecord.id,
          supabaseAdmin,
        })
        break
      case 'wechat':
        transferResult = await transferViaWeChat({
          sellerId,
          amount: actualAmount,
          currency,
          accountInfo: account.account_info,
          transferId: transferRecord.id,
          supabaseAdmin,
        })
        break
      case 'bank':
        // Bank transfers are manual, just mark as pending
        transferResult = {
          success: true,
          transferId: transferRecord.id,
          transferRef: 'manual_bank_transfer',
        }
        // Update status to pending (seller needs to confirm manually)
        await supabaseAdmin
          .from('payment_transfers')
          .update({ status: 'pending' })
          .eq('id', transferRecord.id)
        break
      default:
        transferResult = {
          success: false,
          error: `Unsupported payment method: ${paymentMethod}`,
        }
    }

    // Update transfer record with result
    if (transferResult.success) {
      await supabaseAdmin
        .from('payment_transfers')
        .update({
          status: 'completed',
          transfer_ref: transferResult.transferRef,
          transferred_at: new Date().toISOString(),
        })
        .eq('id', transferRecord.id)

      logTransferSuccess({
        transferId: transferRecord.id,
        sellerId,
        amount: actualAmount,
        currency,
        paymentMethod,
        orderId,
        originalAmount: amount,
        deductedDebt: debtResult.deductedDebtAmount,
      })
    } else {
      // Check if we should retry
      const currentRetryCount = (transferRecord as any).retry_count || 0
      const maxRetries = (transferRecord as any).max_retries || 3

      if (currentRetryCount < maxRetries) {
        // Increment retry count and mark for retry
        await supabaseAdmin
          .from('payment_transfers')
          .update({
            status: 'failed',
            error_message: transferResult.error,
            retry_count: currentRetryCount + 1,
            last_retry_at: new Date().toISOString(),
          })
          .eq('id', transferRecord.id)

        logTransferFailure(
          {
            transferId: transferRecord.id,
            sellerId,
            amount,
            currency,
            paymentMethod,
            orderId,
          },
          new Error(transferResult.error || 'Transfer failed'),
          true // retryable
        )

        // Return result indicating retry is possible
        return {
          ...transferResult,
          transferId: transferRecord.id,
          retryable: true,
          retryCount: currentRetryCount + 1,
        }
      } else {
        // Max retries reached, mark as permanently failed
        await supabaseAdmin
          .from('payment_transfers')
          .update({
            status: 'failed',
            error_message: transferResult.error,
            retry_count: currentRetryCount,
          })
          .eq('id', transferRecord.id)

        logTransferFailure(
          {
            transferId: transferRecord.id,
            sellerId,
            amount,
            currency,
            paymentMethod,
            orderId,
          },
          new Error(transferResult.error || 'Transfer failed'),
          false // not retryable
        )
      }
    }

    return {
      ...transferResult,
      transferId: transferRecord.id,
    }
  } catch (error: any) {
    const paymentError = createPaymentError(error, {
      sellerId,
      amount,
      currency,
      paymentMethod,
      orderId,
    })
    logPaymentError(paymentError)
    return {
      success: false,
      error: paymentError.userMessage,
    }
  }
}

/**
 * Transfer via Stripe Connect
 */
async function transferViaStripe({
  sellerId,
  amount,
  currency,
  accountInfo,
  transferId,
  supabaseAdmin,
}: {
  sellerId: string
  amount: number
  currency: string
  accountInfo: any
  transferId: string
  supabaseAdmin: SupabaseClient
}): Promise<TransferResult> {
  try {
    const { transferToSellerViaStripe } = await import('@/lib/payments/stripe-connect')
    const result = await transferToSellerViaStripe({
      sellerId,
      amount,
      currency,
      stripeAccountId: accountInfo.stripe?.account_id,
    })

    if (result.success) {
      return {
        success: true,
        transferRef: result.transferId,
      }
    }

    return {
      success: false,
      error: result.error || 'Stripe transfer failed',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Stripe transfer error',
    }
  }
}

/**
 * Transfer via PayPal Payouts
 */
async function transferViaPayPal({
  sellerId,
  amount,
  currency,
  accountInfo,
  transferId,
  supabaseAdmin,
}: {
  sellerId: string
  amount: number
  currency: string
  accountInfo: any
  transferId: string
  supabaseAdmin: SupabaseClient
}): Promise<TransferResult> {
  try {
    const { createPayPalPayout } = await import('@/lib/payments/paypal-payouts')
    const result = await createPayPalPayout({
      email: accountInfo.paypal?.email,
      amount,
      currency,
    })

    if (result.success) {
      return {
        success: true,
        transferRef: result.payoutId,
      }
    }

    return {
      success: false,
      error: result.error || 'PayPal payout failed',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'PayPal payout error',
    }
  }
}

/**
 * Transfer via Alipay
 */
async function transferViaAlipay({
  sellerId,
  amount,
  currency,
  accountInfo,
  transferId,
  supabaseAdmin,
}: {
  sellerId: string
  amount: number
  currency: string
  accountInfo: any
  transferId: string
  supabaseAdmin: SupabaseClient
}): Promise<TransferResult> {
  try {
    const { transferToAlipay } = await import('@/lib/payments/alipay-transfer')
    const result = await transferToAlipay({
      account: accountInfo.alipay?.account,
      realName: accountInfo.alipay?.real_name,
      amount,
      currency,
    })

    if (result.success) {
      return {
        success: true,
        transferRef: result.transferId,
      }
    }

    return {
      success: false,
      error: result.error || 'Alipay transfer failed',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Alipay transfer error',
    }
  }
}

/**
 * Transfer via WeChat Pay
 */
async function transferViaWeChat({
  sellerId,
  amount,
  currency,
  accountInfo,
  transferId,
  supabaseAdmin,
}: {
  sellerId: string
  amount: number
  currency: string
  accountInfo: any
  transferId: string
  supabaseAdmin: SupabaseClient
}): Promise<TransferResult> {
  try {
    const { transferToWeChat } = await import('@/lib/payments/wechat-transfer')
    const result = await transferToWeChat({
      mchId: accountInfo.wechat?.mch_id,
      appId: accountInfo.wechat?.app_id,
      amount,
      currency,
    })

    if (result.success) {
      return {
        success: true,
        transferRef: result.transferId,
      }
    }

    return {
      success: false,
      error: result.error || 'WeChat transfer failed',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'WeChat transfer error',
    }
  }
}
