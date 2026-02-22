/**
 * Unified service layer for processing subscription payments
 * Supports tiered seller subscriptions, affiliate subscriptions, and tip feature subscriptions.
 * 
 * 3档纯净模式更新:
 * - 支持新的 tier 值: 15, 50, 100
 * - 记录 display_price 和 product_limit
 * - 同步 subscription_tier 和 product_limit 到 profiles
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { enableSellerPayment } from '../deposits/payment-control'
import { logPaymentSuccess, logPaymentFailure, logIdempotencyHit, logPayment, LogLevel } from './logger'
import { createPaymentError, logPaymentError } from './error-handler'
import { convertCurrency } from '@/lib/currency/convert-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { logAudit } from '@/lib/api/audit'
import { SELLER_TIER_DETAILS } from '@/lib/subscriptions/pricing'
import { recordSubscriptionPaymentLedger } from './ledger-helpers'

interface ProcessSubscriptionPaymentParams {
  userId: string
  subscriptionType: 'seller' | 'affiliate' | 'tip'
  amount: number
  expiresAt: Date
  subscriptionTier?: number // For seller subscriptions: 15, 50, 100 (3档纯净模式)
  currency?: string
  paymentMethod?: string
  supabaseAdmin: SupabaseClient
  isFirstMonth?: boolean // 新增: 是否首月折扣
}

export async function processSubscriptionPayment({
  userId,
  subscriptionType,
  amount,
  expiresAt,
  subscriptionTier,
  currency = 'USD',
  paymentMethod = 'stripe',
  supabaseAdmin,
  isFirstMonth = false,
}: ProcessSubscriptionPaymentParams): Promise<{ success: boolean; error?: string }> {
  try {
    // 3档纯净模式: 获取档位详情
    let displayPrice = amount
    let productLimit = 0
    let isDiscounted = false
    let discountExpiryDate: string | null = null

    if (subscriptionType === 'seller' && subscriptionTier) {
      const tierDetail = SELLER_TIER_DETAILS[subscriptionTier]
      if (tierDetail) {
        displayPrice = tierDetail.displayPrice
        productLimit = tierDetail.productLimit
      }

      // 检查是否首月折扣
      if (isFirstMonth) {
        displayPrice = displayPrice * 0.5 // 50% 折扣
        isDiscounted = true
        const expiryDate = new Date()
        expiryDate.setDate(expiryDate.getDate() + 30)
        discountExpiryDate = expiryDate.toISOString()
      }
    }

    // For seller subscriptions, subscription_tier = deposit_credit
    // 首月折扣时，保证金额度也按折扣比例计算（用户付多少，获得多少额度）
    const depositCredit = subscriptionType === 'seller' && subscriptionTier
      ? (isFirstMonth ? Math.round(subscriptionTier * 0.5 * 100) / 100 : subscriptionTier)
      : null

    // Create subscription record with 3档纯净模式字段
    const { data: newSub, error: subError } = await supabaseAdmin.from('subscriptions').insert({
      user_id: userId,
      subscription_type: subscriptionType,
      subscription_tier: subscriptionTier || null,
      deposit_credit: depositCredit,
      payment_method: paymentMethod,
      amount: amount, // 内部 tier 值
      display_price: displayPrice, // 显示价格
      currency: currency,
      product_limit: productLimit, // 商品数量限制
      is_discounted: isDiscounted, // 是否首月折扣
      discount_expiry_date: discountExpiryDate, // 折扣到期日
      status: 'active',
      starts_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
      .select('id')
      .single()

    if (subError) {
      // Check if it's a duplicate (idempotency)
      if (subError.code === '23505') {
        // Unique constraint violation
        logIdempotencyHit('subscription', {
          userId,
          subscriptionType,
          amount,
          currency,
        })
        return { success: true }
      }
      const paymentError = createPaymentError(subError, {
        userId,
        subscriptionType,
        amount,
        currency,
      })
      logPaymentError(paymentError)
      return { success: false, error: paymentError.userMessage }
    }

    // Sync profile subscription-derived fields from subscriptions table
    // This is the single source of truth for subscription state (Risk 3)
    // The sync function will calculate subscription_type, subscription_expires_at,
    // seller_subscription_tier, tip_enabled, and role from active subscriptions
    const { error: syncError } = await supabaseAdmin.rpc('sync_profile_subscription_derived', {
      p_user_id: userId,
    })

    if (syncError) {
      logPayment(LogLevel.ERROR, 'Error syncing profile subscription state', {
        userId,
        subscriptionType,
        error: syncError.message || 'Unknown error',
      })
      // Don't fail the payment if sync fails, but log it
      // The subscription is already created, sync can be retried later
      // Note: The database trigger trg_subscription_change will also sync profiles
    }

    // If seller subscription, check if payment should be enabled
    if (subscriptionType === 'seller') {
      // Enable payment if it was disabled due to deposit requirement
      await enableSellerPayment(userId, supabaseAdmin)
    }

    // 🚨 V2.3 统一鉴权系统：JWT Claim Sync + Realtime 事件
    // 同步更新 JWT Claims，确保 UI 和 API 授权一致性
    await syncJWTClaimsAndNotify({
      userId,
      subscriptionType,
      subscriptionTier,
      expiresAt,
      supabaseAdmin,
    })

    // Create notification (use content_key for i18n)
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type: 'system',
      title: 'Subscription Activated',
      content: `Your ${subscriptionType} subscription has been activated successfully`,
      related_type: 'user',
      link: '/subscription/manage',
      content_key: 'subscription_renewed',
      content_params: {
        subscriptionType,
        subscriptionTier: subscriptionTier?.toString() || '',
      },
    })

    logPaymentSuccess('subscription', {
      userId,
      subscriptionType,
      amount,
      currency,
      paymentMethod,
      subscriptionTier: subscriptionTier?.toString(),
      displayPrice,
      productLimit,
      isDiscounted,
    })

    try {
      await recordSubscriptionPaymentLedger(supabaseAdmin, {
        subscriptionId: newSub.id,
        userId,
        subscriptionType,
        amount,
        currency,
      })
    } catch (ledgerError: any) {
      console.error('[process-subscription-payment] Failed to record ledger:', ledgerError.message)
    }

    logAudit({
      action: 'subscription_payment_success',
      userId,
      resourceId: newSub?.id,
      resourceType: 'subscription',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        subscriptionType,
        subscriptionTier: subscriptionTier?.toString() ?? undefined,
        amount,
        currency,
        displayPrice,
        productLimit,
        isDiscounted,
      },
    })

    return { success: true }
  } catch (error: any) {
    const paymentError = createPaymentError(error, {
      userId,
      subscriptionType,
      amount,
      currency,
    })
    logPaymentError(paymentError)
    return { success: false, error: paymentError.userMessage }
  }
}

/**
 * 🚨 V2.3 统一鉴权系统：JWT Claim Sync + Realtime 事件
 * 同步更新 JWT Claims 并发送 Realtime 事件通知客户端
 * 这是解决 Authority Source Drift 的关键步骤
 */
interface SyncJWTClaimsParams {
  userId: string
  subscriptionType: 'seller' | 'affiliate' | 'tip'
  subscriptionTier?: number
  expiresAt: Date
  supabaseAdmin: SupabaseClient
}

async function syncJWTClaimsAndNotify({
  userId,
  subscriptionType,
  subscriptionTier,
  expiresAt,
  supabaseAdmin,
}: SyncJWTClaimsParams): Promise<void> {
  const MAX_RETRIES = 3
  let jwtUpdated = false

  // Step 1: 更新 JWT Claims（带重试机制）
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const appMetadata: Record<string, any> = {
        seller: subscriptionType === 'seller',
        affiliate: subscriptionType === 'affiliate',
        tip_enabled: subscriptionType === 'tip',
        expires_at: expiresAt.toISOString(),
      }

      if (subscriptionType === 'seller' && subscriptionTier) {
        appMetadata.seller_tier = subscriptionTier
      }

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: appMetadata,
      })

      // 验证更新成功
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
      
      if (!userData?.user) continue
      
      if (subscriptionType === 'seller' && userData.user.app_metadata?.seller === true) {
        jwtUpdated = true
        break
      } else if (subscriptionType === 'affiliate' && userData.user.app_metadata?.affiliate === true) {
        jwtUpdated = true
        break
      } else if (subscriptionType === 'tip' && userData.user.app_metadata?.tip_enabled === true) {
        jwtUpdated = true
        break
      }

      // 如果验证失败，等待后重试
      if (i < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1))) // 指数退避
      }
    } catch (error) {
      console.error(`[syncJWTClaims] Attempt ${i + 1} failed:`, error)
      if (i === MAX_RETRIES - 1) {
        // 最后一次重试失败，记录错误但继续发送 Realtime 事件
        logPayment(LogLevel.ERROR, 'Failed to sync JWT claims after retries', {
          userId,
          subscriptionType,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      } else {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      }
    }
  }

  // Step 2: 发送 Realtime 事件通知客户端
  try {
    const channel = supabaseAdmin.channel(`user:${userId}`)
    await channel.send({
      type: 'broadcast',
      event: 'subscription_updated',
      payload: {
        subscriptionType,
        subscriptionTier,
        expiresAt: expiresAt.toISOString(),
        jwtUpdated,
        timestamp: new Date().toISOString(),
      },
    })

    logPayment(LogLevel.INFO, 'Sent subscription_updated realtime event', {
      userId,
      subscriptionType,
      jwtUpdated,
    })
  } catch (error) {
    // Realtime 发送失败不应影响主流程
    logPayment(LogLevel.WARN, 'Failed to send realtime event', {
      userId,
      subscriptionType,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * Activate a pending subscription (e.g. after Alipay/WeChat callback or bank approval).
 * Updates status to 'active', syncs profile, sends notification.
 * 
 * 3档纯净模式: 更新时同步新字段
 */
export async function activatePendingSubscription({
  subscriptionId,
  provider,
  providerRef,
  paidAmount,
  currency,
  supabaseAdmin,
}: {
  subscriptionId: string
  provider: 'alipay' | 'wechat' | 'bank'
  providerRef: string
  paidAmount: number
  currency: string
  supabaseAdmin: import('@supabase/supabase-js').SupabaseClient
}): Promise<{ success: boolean; error?: string }> {
  try {
    // 3档纯净模式: 获取完整的订阅信息
    // 多币种支持: 包含 user_amount, user_currency, exchange_rate, exchange_rate_at
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, subscription_type, subscription_tier, amount, currency, status, display_price, product_limit, is_discounted, discount_expiry_date, user_amount, user_currency, exchange_rate, exchange_rate_at')
      .eq('id', subscriptionId)
      .single()

    if (subErr || !sub) {
      return { success: false, error: 'Subscription not found' }
    }
    if (sub.status !== 'pending') {
      logIdempotencyHit('subscription', {
        subscriptionId,
        provider,
        providerRef,
      })
      return { success: true }
    }

    const { data: existingTx } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, status')
      .eq('provider', provider)
      .eq('provider_ref', providerRef)
      .eq('type', 'subscription')
      .eq('related_id', subscriptionId)
      .maybeSingle()

    if (existingTx?.status === 'paid') {
      return { success: true }
    }

    // 多币种支持: 验证支付金额
    // 使用订阅记录中的 display_price 进行验证（display_price 是用户实际看到的金额）
    const expectedAmount = sub.display_price ? parseFloat(String(sub.display_price)) : parseFloat(String(sub.amount))
    const expectedCurrency = (sub.currency as Currency) || 'USD'
    const platformAmount = parseFloat(String(sub.amount))
    const platformCurrency = (sub.currency as Currency) || 'USD'
    
    // 如果支付货币与平台货币不同，需要转换后比较
    let expectedInPaymentCurrency: number
    if (expectedCurrency === currency) {
      expectedInPaymentCurrency = sub.user_amount ? parseFloat(String(sub.user_amount)) : expectedAmount
    } else {
      // 将用户金额转换为支付货币
      const amountToConvert = sub.user_amount ? parseFloat(String(sub.user_amount)) : expectedAmount
      expectedInPaymentCurrency = convertCurrency(amountToConvert, expectedCurrency as Currency, currency as Currency)
    }
    
    // 允许 0.02 的误差（浮点数精度）
    if (Math.abs(paidAmount - expectedInPaymentCurrency) > 0.02) {
      return { success: false, error: `Amount mismatch: expected ${expectedInPaymentCurrency} ${currency}, got ${paidAmount}` }
    }

    // 多币种支持: 记录交易时保存用户货币和平台货币信息
    const userAmount = sub.user_amount ? parseFloat(String(sub.user_amount)) : paidAmount
    const userCurrency = (sub.user_currency as string) || currency
    
    if (!existingTx) {
      await supabaseAdmin.from('payment_transactions').insert({
        type: 'subscription',
        provider,
        provider_ref: providerRef,
        // 支付金额 (支付货币)
        amount: paidAmount,
        currency,
        // 多币种支持字段
        user_amount: userAmount,
        user_currency: userCurrency,
        platform_amount: platformAmount,
        platform_currency: platformCurrency,
        exchange_rate: sub.exchange_rate,
        exchange_rate_at: sub.exchange_rate_at,
        status: 'paid',
        related_id: subscriptionId,
        paid_at: new Date().toISOString(),
        metadata: { 
          subscription_type: sub.subscription_type,
          subscription_tier: sub.subscription_tier,
          display_price: sub.display_price,
          product_limit: sub.product_limit,
        },
      })
    } else {
      await supabaseAdmin
        .from('payment_transactions')
        .update({ 
          status: 'paid', 
          paid_at: new Date().toISOString(),
          // 更新多币种字段
          user_amount: userAmount,
          user_currency: userCurrency,
          platform_amount: platformAmount,
          platform_currency: platformCurrency,
        })
        .eq('id', existingTx.id)
    }

    await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('id', subscriptionId)

    const { error: syncError } = await supabaseAdmin.rpc('sync_profile_subscription_derived', {
      p_user_id: sub.user_id,
    })
    if (syncError) {
      logPayment(LogLevel.ERROR, 'Error syncing profile after activating subscription', {
        subscriptionId,
        userId: sub.user_id,
        error: syncError.message,
      })
      // Note: The database trigger trg_subscription_change will also sync profiles
    }

    if (sub.subscription_type === 'seller') {
      await enableSellerPayment(sub.user_id, supabaseAdmin)
    }

    // 🚨 V2.3 统一鉴权系统：JWT Claim Sync + Realtime 事件
    // 同步更新 JWT Claims，确保 UI 和 API 授权一致性
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    await syncJWTClaimsAndNotify({
      userId: sub.user_id,
      subscriptionType: sub.subscription_type as 'seller' | 'affiliate' | 'tip',
      subscriptionTier: sub.subscription_tier ? parseFloat(String(sub.subscription_tier)) : undefined,
      expiresAt,
      supabaseAdmin,
    })

    // Create notification (use content_key for i18n)
    await supabaseAdmin.from('notifications').insert({
      user_id: sub.user_id,
      type: 'system',
      title: 'Subscription Activated',
      content: `Your ${sub.subscription_type} subscription has been activated successfully`,
      related_type: 'user',
      link: '/subscription/manage',
      content_key: 'subscription_renewed',
      content_params: {
        subscriptionType: sub.subscription_type,
        subscriptionTier: sub.subscription_tier?.toString() || '',
      },
    })

    logPaymentSuccess('subscription', {
      subscriptionId,
      userId: sub.user_id,
      subscriptionType: sub.subscription_type,
      amount: paidAmount,
      currency,
      paymentMethod: provider,
      subscriptionTier: sub.subscription_tier?.toString(),
      productLimit: sub.product_limit,
      isDiscounted: sub.is_discounted,
    })

    try {
      await recordSubscriptionPaymentLedger(supabaseAdmin, {
        subscriptionId,
        userId: sub.user_id,
        subscriptionType: sub.subscription_type as 'seller' | 'affiliate' | 'tip',
        amount: paidAmount,
        currency,
      })
    } catch (ledgerError: any) {
      console.error('[process-subscription-payment] Failed to record ledger:', ledgerError.message)
    }

    logAudit({
      action: 'subscription_payment_success',
      userId: sub.user_id,
      resourceId: subscriptionId,
      resourceType: 'subscription',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        planId: sub.subscription_type,
        subscriptionTier: sub.subscription_tier?.toString() ?? undefined,
        amount: paidAmount,
        currency,
        productLimit: sub.product_limit,
        isDiscounted: sub.is_discounted,
      },
    })

    return { success: true }
  } catch (e: any) {
    logPayment(LogLevel.ERROR, 'activatePendingSubscription error', {
      subscriptionId,
      provider,
      error: e.message || 'Unknown error',
    })
    return { success: false, error: e.message || 'Unknown error' }
  }
}
