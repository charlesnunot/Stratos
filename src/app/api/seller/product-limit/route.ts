/**
 * API for checking seller product limits
 * 3档纯净模式: 检查当前商品数量限制和使用情况
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SELLER_TIER_DETAILS } from '@/lib/subscriptions/pricing'

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

    // 获取用户 profile 信息
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, seller_type, subscription_tier, product_limit')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      )
    }

    // 检查是否是卖家
    if (profile.role !== 'seller') {
      return NextResponse.json(
        { error: 'User is not a seller' },
        { status: 403 }
      )
    }

    // 直营卖家无限制
    if (profile.seller_type === 'direct') {
      return NextResponse.json({
        canCreate: true,
        currentCount: 0,
        productLimit: 999999,
        remaining: 999999,
        isDirectSeller: true,
        subscriptionTier: null,
      })
    }

    // 统计当前已上架商品数量
    const { count: currentCount, error: countError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', user.id)
      .eq('status', 'active')

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to count products' },
        { status: 500 }
      )
    }

    const productLimit = profile.product_limit || 0
    const remaining = Math.max(productLimit - (currentCount || 0), 0)
    const canCreate = productLimit === 999999 || (currentCount || 0) < productLimit

    // 获取下一档信息（用于升级建议）
    let nextTier = null
    if (profile.subscription_tier) {
      const tiers = [15, 50, 100]
      const currentIndex = tiers.indexOf(profile.subscription_tier)
      if (currentIndex >= 0 && currentIndex < tiers.length - 1) {
        const nextTierValue = tiers[currentIndex + 1]
        const nextTierDetail = SELLER_TIER_DETAILS[nextTierValue]
        if (nextTierDetail) {
          nextTier = {
            tier: nextTierValue,
            displayPrice: nextTierDetail.displayPrice,
            productLimit: nextTierDetail.productLimit,
            additionalProducts: nextTierDetail.productLimit - productLimit,
          }
        }
      }
    }

    return NextResponse.json({
      canCreate,
      currentCount: currentCount || 0,
      productLimit,
      remaining,
      isDirectSeller: false,
      subscriptionTier: profile.subscription_tier,
      nextTier,
    })
  } catch (error: unknown) {
    console.error('[product-limit] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to check product limit'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
