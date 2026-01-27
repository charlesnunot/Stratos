/**
 * Create Alipay/WeChat payment for a pending subscription.
 * Call after create-pending. Callback will activate the subscription.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionPrice } from '@/lib/subscriptions/pricing'
import type { SubscriptionType } from '@/lib/subscriptions/pricing'

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
      .select('id, user_id, subscription_type, subscription_tier, status')
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

    const typeName: Record<string, string> = {
      seller: '卖家订阅',
      affiliate: '带货者订阅',
      tip: '打赏功能订阅',
    }
    const subject = typeName[sub.subscription_type] || '订阅'
    const { amount } = getSubscriptionPrice(
      sub.subscription_type as SubscriptionType,
      sub.subscription_tier ?? undefined,
      'CNY'
    )

    const outTradeNo = `sub_${subscriptionId}_${Date.now()}`
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000'

    if (paymentMethod === 'alipay') {
      const { createAlipayOrder } = await import('@/lib/payments/alipay')
      const notifyUrl = `${origin}/api/payments/alipay/callback`
      const result = await createAlipayOrder({
        outTradeNo,
        totalAmount: amount,
        subject,
        notifyUrl,
        metadata: { type: 'subscription', subscriptionId, subscriptionType: sub.subscription_type },
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
        totalAmount: amount,
        description: subject,
        notifyUrl,
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
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to create subscription payment' },
      { status: 500 }
    )
  }
}
