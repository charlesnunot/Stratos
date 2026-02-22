import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { checkTipEnabled, checkTipLimits } from '@/lib/payments/check-tip-limits'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { verifyMonetizationToken } from '@/lib/auth/capabilities'
import { getPaymentDestination } from '@/lib/payments/get-payment-destination'

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

    const { amount, postId, postAuthorId, successUrl, cancelUrl, currency = 'CNY', monetizationToken } =
      await request.json()

    if (!amount || !postId || !postAuthorId || !successUrl || !cancelUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // P4 修复: 强制要求 Monetization Token（金融级安全）
    if (!monetizationToken) {
      return NextResponse.json(
        { error: 'Monetization token required' },
        { status: 403 }
      )
    }

    const tokenVerification = verifyMonetizationToken(monetizationToken)
    if (!tokenVerification.valid) {
      return NextResponse.json(
        { error: `Monetization authorization invalid: ${tokenVerification.error}` },
        { status: 403 }
      )
    }
    if (!tokenVerification.payload?.canReceiveTips) {
      return NextResponse.json(
        { error: 'Author cannot receive tips' },
        { status: 403 }
      )
    }
    if (tokenVerification.payload?.userId !== postAuthorId) {
      return NextResponse.json(
        { error: 'Monetization token does not match post author' },
        { status: 403 }
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
    if (postAuthorId === user.id) {
      return NextResponse.json(
        { error: 'Cannot tip yourself' },
        { status: 400 }
      )
    }

    // ✅ 修复 P1: 检查黑名单 - 如果被拉黑，不能打赏
    const { data: blocked } = await supabaseAdmin
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', postAuthorId)
      .eq('blocked_id', user.id)
      .limit(1)
      .maybeSingle()

    if (blocked) {
      return NextResponse.json(
        { error: 'You have been blocked by this user' },
        { status: 403 }
      )
    }

    // Verify post exists and validate post author
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id, user_id, status')
      .eq('id', postId)
      .single()

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      )
    }

    if (post.user_id !== postAuthorId) {
      return NextResponse.json(
        { error: 'Post author mismatch' },
        { status: 400 }
      )
    }

    if (post.status !== 'approved') {
      return NextResponse.json(
        { error: 'Post not approved' },
        { status: 400 }
      )
    }

    // ✅ 修复 P2: 检查接收者是否开启打赏功能
    const { data: recipientProfile } = await supabaseAdmin
      .from('profiles')
      .select('tip_enabled')
      .eq('id', postAuthorId)
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
      .eq('user_id', postAuthorId)
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

    // Check tip limits
    const limitCheck = await checkTipLimits(
      user.id,
      postAuthorId,
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

    // Get payment destination (platform vs user direct)
    const destination = await getPaymentDestination({
      recipientId: postAuthorId,
      context: 'tip',
    })

    const session = await createCheckoutSession(
      numericAmount,
      successUrl,
      cancelUrl,
      {
        userId: user.id,
        postId,
        postAuthorId,
        type: 'tip',
      },
      String(currency || 'CNY').toLowerCase(),
      destination?.destinationAccountId
    )

    if (!session || !session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Tip checkout session error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
