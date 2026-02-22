/**
 * Seller API: Coupon Management
 * GET: List seller's coupons
 * POST: Create new coupon
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

// Validate seller tier
async function validateSellerTier(supabase: any, userId: string): Promise<{ valid: boolean; tier?: number; error?: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('seller_type')
    .eq('id', userId)
    .single()

  if (profile?.seller_type === 'direct') {
    return { valid: true, tier: 100 }
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .eq('subscription_type', 'seller')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()

  if (!subscription) {
    return { valid: false, error: 'No active seller subscription' }
  }

  if (subscription.subscription_tier < 50) {
    return { valid: false, error: 'Coupon feature requires Growth or Scale tier' }
  }

  return { valid: true, tier: subscription.subscription_tier }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate tier
    const tierCheck = await validateSellerTier(supabase, user.id)
    if (!tierCheck.valid) {
      return NextResponse.json({ error: tierCheck.error }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'active', 'expired', 'all'
    const includeStats = searchParams.get('stats') === 'true'

    let query
    if (includeStats) {
      query = supabase
        .from('seller_coupon_stats')
        .select('*')
        .eq('seller_id', user.id)
    } else {
      query = supabase
        .from('seller_coupons')
        .select('*')
        .eq('seller_id', user.id)
    }

    // Filter by status
    if (status === 'active') {
      query = query.eq('is_active', true).gt('valid_until', new Date().toISOString())
    } else if (status === 'expired') {
      query = query.lt('valid_until', new Date().toISOString())
    }

    const { data: coupons, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[seller/coupons GET] Error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch coupons', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ coupons: coupons || [] })
  } catch (error: unknown) {
    console.error('[seller/coupons GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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

    // Validate tier
    const tierCheck = await validateSellerTier(supabase, user.id)
    if (!tierCheck.valid) {
      return NextResponse.json({ error: tierCheck.error }, { status: 403 })
    }

    const body = await request.json()
    const {
      code,
      title,
      description,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount_amount,
      max_uses,
      max_uses_per_user,
      valid_from,
      valid_until,
      applicable_products,
      excluded_products,
    } = body

    // Validate required fields
    if (!code || !title || !discount_type || discount_value === undefined || !valid_from || !valid_until) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate code format (alphanumeric, 3-20 chars)
    if (!/^[A-Z0-9]{3,20}$/i.test(code)) {
      return NextResponse.json(
        { error: 'Code must be 3-20 alphanumeric characters' },
        { status: 400 }
      )
    }

    // Validate discount value
    if (discount_type === 'percentage' && (discount_value <= 0 || discount_value > 100)) {
      return NextResponse.json(
        { error: 'Percentage discount must be between 1 and 100' },
        { status: 400 }
      )
    }

    if (discount_type === 'fixed_amount' && discount_value <= 0) {
      return NextResponse.json(
        { error: 'Fixed amount discount must be greater than 0' },
        { status: 400 }
      )
    }

    // Validate dates
    const validFromDate = new Date(valid_from)
    const validUntilDate = new Date(valid_until)

    if (validUntilDate <= validFromDate) {
      return NextResponse.json(
        { error: 'Valid until must be after valid from' },
        { status: 400 }
      )
    }

    // Check coupon limit based on tier
    const { count: existingCount } = await supabase
      .from('seller_coupons')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', user.id)
      .eq('is_active', true)

    const maxCoupons = tierCheck.tier === 100 ? 20 : 10
    if ((existingCount || 0) >= maxCoupons) {
      return NextResponse.json(
        { error: `You can have at most ${maxCoupons} active coupons` },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()

    const { data: coupon, error: insertError } = await admin
      .from('seller_coupons')
      .insert({
        seller_id: user.id,
        code: code.toUpperCase(),
        title,
        description,
        discount_type,
        discount_value,
        min_order_amount: min_order_amount || null,
        max_discount_amount: max_discount_amount || null,
        max_uses: max_uses || null,
        max_uses_per_user: max_uses_per_user || 1,
        valid_from: validFromDate.toISOString(),
        valid_until: validUntilDate.toISOString(),
        applicable_products: applicable_products || null,
        excluded_products: excluded_products || null,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Coupon code already exists' },
          { status: 409 }
        )
      }
      console.error('[seller/coupons POST] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create coupon', details: insertError.message },
        { status: 500 }
      )
    }

    logAudit({
      action: 'create_coupon',
      userId: user.id,
      resourceId: coupon.id,
      resourceType: 'seller_coupon',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { code, discount_type, discount_value },
    })

    return NextResponse.json({ coupon }, { status: 201 })
  } catch (error: unknown) {
    console.error('[seller/coupons POST] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
