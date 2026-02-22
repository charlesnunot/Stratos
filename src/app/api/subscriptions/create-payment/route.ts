/**
 * Create Alipay/WeChat payment for a pending subscription.
 * Call after create-pending. Callback will activate the subscription.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/api/audit'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subscriptionId, paymentMethod } = body

    if (!subscriptionId || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing required fields: subscriptionId and paymentMethod' },
        { status: 400 }
      )
    }

    if (!['alipay', 'wechat'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'paymentMethod must be alipay or wechat' },
        { status: 400 }
      )
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, subscription_type, subscription_tier, status, currency, amount')
      .eq('id', subscriptionId)
      .single()

    if (subErr || !sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }
    if (sub.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (sub.status !== 'pending') {
      return NextResponse.json(
        { error: 'Subscription is not pending. Only pending subscriptions can be paid.' },
        { status: 400 }
      )
    }

    if (sub.subscription_type === 'creator') {
      return NextResponse.json(
        { error: 'Creator (paid chapters) subscription is no longer supported' },
        { status: 400 }
      )
    }
    const typeName: Record<string, string> = {
      seller: '卖家订阅',
      affiliate: '带货者订阅',
      tip: '打赏功能订阅',
    }
    const subject = typeName[sub.subscription_type] || '订阅'
    
    // 多币种支持: 使用订阅记录中保存的金额和货币
    // 优先使用平台收款金额 (amount)，如果不存在则使用用户金额 (user_amount)
    const platformCurrency = (sub.currency as string) || 'CNY'
    const platformAmount = typeof sub.amount === 'string' ? parseFloat(sub.amount) : (sub.amount as number) || 0
    
    // 支付宝/微信支付只支持CNY
    // 如果平台货币不是CNY，需要转换或报错
    let paymentAmount = platformAmount
    let paymentCurrency = platformCurrency
    
    // 如果平台货币不是CNY，但使用支付宝/微信，需要检查是否支持
    if ((paymentMethod === 'alipay' || paymentMethod === 'wechat') && platformCurrency !== 'CNY') {
      // 查询汇率转换为CNY
      const { data: rateData } = await supabaseAdmin
        .from('exchange_rates')
        .select('rate')
        .eq('base_currency', platformCurrency)
        .eq('target_currency', 'CNY')
        .lte('valid_from', new Date().toISOString())
        .or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())
        .order('valid_from', { ascending: false })
        .limit(1)
        .single()
      
      if (rateData) {
        paymentAmount = platformAmount * rateData.rate
        paymentCurrency = 'CNY'
      } else {
        // 没有汇率，使用固定汇率
        const fallbackRates: Record<string, number> = {
          'USD': 7.2,
          'EUR': 7.8,
          'GBP': 9.2,
          'JPY': 0.048,
          'KRW': 0.0055,
          'SGD': 5.4,
          'HKD': 0.92,
          'AUD': 4.7,
          'CAD': 5.3,
        }
        const rate = fallbackRates[platformCurrency] || 7.2
        paymentAmount = platformAmount * rate
        paymentCurrency = 'CNY'
      }
    }
    
    // 确保金额格式正确 (支付宝/微信要求2位小数)
    paymentAmount = Math.round(paymentAmount * 100) / 100

    const outTradeNo = `sub_${subscriptionId}_${Date.now()}`
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000'

    logAudit({
      action: 'create_subscription_payment',
      userId: user.id,
      resourceId: subscriptionId,
      resourceType: 'subscription',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { paymentMethod, subscriptionType: sub.subscription_type },
    })

    if (paymentMethod === 'alipay') {
      const { createAlipayOrder } = await import('@/lib/payments/alipay')
      const notifyUrl = `${origin}/api/payments/alipay/callback`
      const result = await createAlipayOrder({
        outTradeNo,
        totalAmount: paymentAmount,
        subject,
        notifyUrl,
        metadata: { 
          type: 'subscription', 
          subscriptionId, 
          subscriptionType: sub.subscription_type,
          platformCurrency: String(platformCurrency),
          platformAmount: String(platformAmount),
          paymentCurrency: String(paymentCurrency),
          paymentAmount: String(paymentAmount),
        },
      })
      const formData: Record<string, string> = {}
      const pairs = (result.orderString || '').split('&')
      for (const p of pairs) {
        const eq = p.indexOf('=')
        if (eq < 0) continue
        const k = p.slice(0, eq)
        const v = p.slice(eq + 1)
        if (k) formData[k] = decodeURIComponent(v || '')
      }
      const gateway =
        process.env.NODE_ENV === 'production'
          ? 'https://openapi.alipay.com/gateway.do'
          : 'https://openapi.alipaydev.com/gateway.do'
      return NextResponse.json({
        paymentMethod: 'alipay',
        formAction: gateway,
        formData,
        outTradeNo,
        subscriptionId,
      })
    }

    if (paymentMethod === 'wechat') {
      const { createWeChatPayOrder } = await import('@/lib/payments/wechat')
      const notifyUrl = `${origin}/api/payments/wechat/notify`
      const wechatOrder = await createWeChatPayOrder({
        outTradeNo,
        totalAmount: paymentAmount,
        description: subject,
        notifyUrl,
        metadata: {
          type: 'subscription',
          subscriptionId,
          subscriptionType: sub.subscription_type,
          platformCurrency: String(platformCurrency),
          platformAmount: String(platformAmount),
          paymentCurrency: String(paymentCurrency),
          paymentAmount: String(paymentAmount),
        },
      })
      const codeUrl =
        (wechatOrder as { codeUrl?: string })?.codeUrl ??
        (wechatOrder as { code_url?: string })?.code_url
      if (!codeUrl) {
        return NextResponse.json(
          { error: 'Failed to create WeChat Pay QR' },
          { status: 500 }
        )
      }
      return NextResponse.json({
        paymentMethod: 'wechat',
        codeUrl,
        outTradeNo,
        subscriptionId,
      })
    }

    return NextResponse.json(
      { error: `Payment method ${paymentMethod} not supported` },
      { status: 400 }
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to create subscription payment'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
