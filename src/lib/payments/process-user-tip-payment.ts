/**
 * Process direct user-to-user tip payments (no post required)
 * 
 * 审计日志规范：
 * - 记录用户打赏处理操作
 * - 不记录具体金额明细
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { checkTipLimits, checkTipEnabled } from './check-tip-limits'
import { logPaymentSuccess, logPayment, LogLevel } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'
import { logAudit } from '@/lib/api/audit'

interface ProcessUserTipPaymentParams {
  tipperId: string
  recipientId: string
  amount: number
  currency?: string
  supabaseAdmin: SupabaseClient
}

export async function processUserTipPayment({
  tipperId,
  recipientId,
  amount,
  currency = 'CNY',
  supabaseAdmin,
}: ProcessUserTipPaymentParams): Promise<{ success: boolean; error?: string }> {
  try {
    // ✅ 检查黑名单 - 如果被拉黑，不能打赏
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

    // ✅ 检查接收者是否开启打赏功能
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

    // 创建用户打赏记录
    // 使用 tip_transactions 表，post_id 设为 null 表示直接打赏用户
    const { error: tipError } = await supabaseAdmin.from('tip_transactions').insert({
      post_id: null, // 直接打赏用户，没有关联帖子
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
        logPaymentSuccess('user_tip', {
          userId: tipperId,
          recipientId,
          amount,
          currency,
        })
        return { success: true }
      }
      const paymentError = createPaymentError(tipError, {
        userId: tipperId,
        recipientId,
        amount,
        currency,
      })
      logPaymentError(paymentError)
      return { success: false, error: paymentError.userMessage }
    }

    // Create notification for recipient (use content_key for i18n)
    const amountFormatted = `¥${amount.toFixed(2)}`
    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      user_id: recipientId,
      type: 'system',
      title: 'Tip Received',
      content: `You received a tip of ${amountFormatted}`,
      related_id: recipientId,
      related_type: 'user',
      link: `/user/${recipientId}`,
      content_key: 'user_tip_received',
      content_params: { amount: amountFormatted },
    })
    if (notifError) {
      console.error('[process-user-tip-payment] Notification insert failed:', notifError.message)
    }

    logPaymentSuccess('user_tip', {
      userId: tipperId,
      recipientId,
      amount,
      currency,
    })

    // 记录用户打赏处理审计日志（action: tip_user 与任务描述一致）
    logAudit({
      action: 'tip_user',
      userId: tipperId,
      resourceId: recipientId,
      resourceType: 'user',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        amount,
        currency,
      },
    })

    return { success: true }
  } catch (error: any) {
    const paymentError = createPaymentError(error, {
      userId: tipperId,
      recipientId,
      amount,
      currency,
    })
    logPaymentError(paymentError)
    return { success: false, error: paymentError.userMessage }
  }
}
