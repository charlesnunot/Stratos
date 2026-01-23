/**
 * Unified service layer for processing tip payments
 * Includes tip limits checking and subscription verification
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { checkTipLimits, checkTipEnabled } from './check-tip-limits'
import { logPaymentSuccess, logPaymentFailure } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'

interface ProcessTipPaymentParams {
  postId: string
  tipperId: string
  recipientId: string
  amount: number
  currency?: string
  supabaseAdmin: SupabaseClient
}

export async function processTipPayment({
  postId,
  tipperId,
  recipientId,
  amount,
  currency = 'CNY',
  supabaseAdmin,
}: ProcessTipPaymentParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if tipper has tip feature enabled
    const tipEnabled = await checkTipEnabled(tipperId, supabaseAdmin)
    if (!tipEnabled) {
      return {
        success: false,
        error: 'Tip feature subscription required. Please subscribe to enable tipping.',
      }
    }

    // Check tip limits
    const limitCheck = await checkTipLimits(tipperId, recipientId, amount, currency, supabaseAdmin)
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: limitCheck.reason || 'Tip limit exceeded',
      }
    }

    // Get payment transaction ID if available
    const { data: paymentTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, provider')
      .eq('related_id', postId)
      .eq('type', 'tip')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Create tip transaction record (use tip_transactions table)
    const { error: tipError } = await supabaseAdmin.from('tip_transactions').insert({
      post_id: postId,
      tipper_id: tipperId,
      recipient_id: recipientId,
      amount: amount,
      currency: currency,
      status: 'paid',
    })

    if (tipError) {
      // Check if it's a duplicate (idempotency)
      if (tipError.code === '23505') {
        // Unique constraint violation
        logPaymentSuccess('tip', {
          postId,
          userId: tipperId,
          recipientId,
          amount,
          currency,
        })
        return { success: true }
      }
      const paymentError = createPaymentError(tipError, {
        postId,
        userId: tipperId,
        recipientId,
        amount,
        currency,
      })
      logPaymentError(paymentError)
      return { success: false, error: paymentError.userMessage }
    }

    // Update post tip amount
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('tip_amount')
      .eq('id', postId)
      .single()

    if (post) {
      const newTipAmount = (post.tip_amount || 0) + amount
      await supabaseAdmin
        .from('posts')
        .update({ tip_amount: newTipAmount })
        .eq('id', postId)
    }

    // Transfer money to recipient (if payment method supports automatic transfer)
    if (paymentTransaction?.provider && paymentTransaction.provider !== 'bank') {
      try {
        const { transferToSeller } = await import('@/lib/payments/transfer-to-seller')
        const transferResult = await transferToSeller({
          sellerId: recipientId,
          amount,
          currency,
          paymentTransactionId: paymentTransaction.id,
          paymentMethod: paymentTransaction.provider as any,
          supabaseAdmin,
        })

        if (!transferResult.success) {
          console.error('Failed to transfer tip to recipient:', transferResult.error)
          // Don't fail the tip if transfer fails - it can be retried later
        }
      } catch (error) {
        console.error('Error transferring tip to recipient:', error)
        // Don't fail the tip if transfer fails
      }
    }

    // Create notification for recipient
    await supabaseAdmin.from('notifications').insert({
      user_id: recipientId,
      type: 'system',
      title: '收到打赏',
      content: `您收到了 ¥${amount.toFixed(2)} 的打赏`,
      related_id: postId,
      related_type: 'post',
      link: `/post/${postId}`,
    })

    logPaymentSuccess('tip', {
      postId,
      userId: tipperId,
      recipientId,
      amount,
      currency,
    })

    return { success: true }
  } catch (error: any) {
    const paymentError = createPaymentError(error, {
      postId,
      userId: tipperId,
      recipientId,
      amount,
      currency,
    })
    logPaymentError(paymentError)
    return { success: false, error: paymentError.userMessage }
  }
}
