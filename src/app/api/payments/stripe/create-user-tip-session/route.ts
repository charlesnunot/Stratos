import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { checkTipEnabled, checkTipLimits } from '@/lib/payments/check-tip-limits'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * 创建直接打赏用户的支付会话（不需要帖子）
 */
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

    const { amount, targetUserId, successUrl, cancelUrl, currency = 'CNY' } =
      await request.json()

    if (!amount || !targetUserId || !successUrl || !cancelUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const numericAmount = parseFloat(amount)
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    try {
      new URL(successUrl)
      new URL(cancelUrl)
    } catch {
      return NextResponse.json(
        { error: 'Invalid success or cancel URL' },
        { status: 400 }
      )
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user has tip feature enabled
    const tipEnabled = await checkTipEnabled(user.id, supabaseAdmin)
    if (!tipEnabled) {
      return NextResponse.json(
        { error: 'Tip feature subscription required. Please subscribe to enable tipping.' },
        { status: 403 }
      )
    }

    // Check subscription status to ensure it's active and not expired
    const { data: tipSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status, expires_at')
      .eq('user_id', user.id)
      .eq('subscription_type', 'tip')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!tipSubscription) {
      return NextResponse.json(
        { error: 'Tip subscription expired or not found. Please renew your subscription.' },
        { status: 403 }
      )
    }

    // Check if user is trying to tip themselves
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: 'Cannot tip yourself' },
        { status: 400 }
      )
    }

    // ✅ 检查黑名单 - 如果被拉黑，不能打赏
    const { data: blocked } = await supabaseAdmin
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', targetUserId)
      .eq('blocked_id', user.id)
      .limit(1)
      .maybeSingle()

    if (blocked) {
      return NextResponse.json(
        { error: 'You have been blocked by this user' },
        { status: 403 }
      )
    }

    // ✅ 检查接收者是否开启打赏功能
    const { data: recipientProfile } = await supabaseAdmin
      .from('profiles')
      .select('tip_enabled')
      .eq('id', targetUserId)
      .single()

    if (!recipientProfile?.tip_enabled) {
      return NextResponse.json(
        { error: 'This user has not enabled tipping' },
        { status: 403 }
      )
    }

    // 检查接收者的打赏订阅是否有效
    const { data: recipientTipSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status, expires_at')
      .eq('user_id', targetUserId)
      .eq('subscription_type', 'tip')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!recipientTipSubscription) {
      return NextResponse.json(
        { error: 'This user\'s tip subscription has expired' },
        { status: 403 }
      )
    }

    // Check tip limits (使用一个虚拟的 postId，因为这是直接打赏用户)
    const limitCheck = await checkTipLimits(
      user.id,
      targetUserId,
      numericAmount,
      String(currency || 'CNY').toUpperCase(),
      supabaseAdmin
    )
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.reason || 'Tip limit exceeded' },
        { status: 400 }
      )
    }

    // 创建一个虚拟的"用户打赏"帖子ID用于记录（可选）
    // 或者我们可以创建一个专门的 user_tips 表
    // 这里我们使用 metadata 来标识这是直接打赏用户
    const session = await createCheckoutSession(
      numericAmount,
      successUrl,
      cancelUrl,
      {
        userId: user.id,
        targetUserId,
        type: 'user_tip', // 标识这是直接打赏用户，不是打赏帖子
      },
      String(currency || 'CNY').toLowerCase()
    )

    if (!session || !session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('User tip checkout session error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
