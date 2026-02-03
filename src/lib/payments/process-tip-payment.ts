/**
 * Unified service layer for processing tip payments
 * Includes tip limits checking and subscription verification
 * 
 * 审计日志规范：
 * - 记录打赏处理操作
 * - 不记录具体金额明细
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { checkTipLimits, checkTipEnabled } from './check-tip-limits'
import { logPaymentSuccess, logPaymentFailure, logPayment, LogLevel } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'
import { logAudit } from '@/lib/api/audit'

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
    // ✅ 修复 P1: 检查黑名单 - 如果被拉黑，不能打赏
    const { data: blocked } = await supabaseAdmin
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', recipientId)
      .eq('blocked_id', tipperId)
      .limit(1)
      .maybeSingle()

    if (blocked) {
      return {
        success: false,
        error: 'You have been blocked by this user',
      }
    }

    // Check if tipper has tip feature enabled
    const tipEnabled = await checkTipEnabled(tipperId, supabaseAdmin)
    if (!tipEnabled) {
      return {
        success: false,
        error: 'Tip feature subscription required. Please subscribe to enable tipping.',
      }
    }

    // ✅ 修复 P2: 检查接收者是否开启打赏功能
    const { data: recipientProfile } = await supabaseAdmin
      .from('profiles')
      .select('tip_enabled')
      .eq('id', recipientId)
      .single()

    if (!recipientProfile?.tip_enabled) {
      return {
        success: false,
        error: 'This user has not enabled tipping',
      }
    }

    // 检查接收者的打赏订阅是否有效
    const { data: recipientTipSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status, expires_at')
      .eq('user_id', recipientId)
      .eq('subscription_type', 'tip')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!recipientTipSubscription) {
      return {
        success: false,
        error: 'This user\'s tip subscription has expired',
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
          logPayment(LogLevel.ERROR, 'Failed to transfer tip to recipient', {
            postId,
            recipientId,
            amount,
            error: transferResult.error,
          })
        }
      } catch (error: any) {
        logPayment(LogLevel.ERROR, 'Error transferring tip to recipient', {
          postId,
          recipientId,
          amount,
          error: error?.message || 'Unknown error',
        })
      }
    }

    // Create notification for recipient (use content_key for i18n)
    const amountFormatted = `¥${amount.toFixed(2)}`
    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      user_id: recipientId,
      type: 'system',
      title: 'Tip Received',
      content: `You received a tip of ${amountFormatted}`,
      related_id: postId,
      related_type: 'post',
      link: `/post/${postId}`,
      content_key: 'tip_received',
      content_params: { amount: amountFormatted, postId: postId.substring(0, 8) + '...' },
    })
    if (notifError) {
      console.error('[process-tip-payment] Notification insert failed:', notifError.message)
    }

    logPaymentSuccess('tip', {
      postId,
      userId: tipperId,
      recipientId,
      amount,
      currency,
    })

    // 记录打赏处理审计日志（action: tip_post 与任务描述一致）
    logAudit({
      action: 'tip_post',
      userId: tipperId,
      resourceId: postId,
      resourceType: 'post',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        recipientId: recipientId.substring(0, 8) + '...',
        amount,
        currency,
      },
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
