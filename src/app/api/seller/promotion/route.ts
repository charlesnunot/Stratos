/**
 * Seller API: Promotion Status
 * GET: Get seller promotion status and priority
 * Available for Growth ($50) and Scale ($100) tier sellers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Get seller profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('seller_type, role')
      .eq('id', user.id)
      .single()

    // Get subscription info
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('subscription_tier, expires_at')
      .eq('user_id', user.id)
      .eq('subscription_type', 'seller')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .single()

    // Get promotion weight
    const { data: promotionWeight } = await supabase
      .from('seller_promotion_weights')
      .select('*')
      .eq('seller_id', user.id)
      .single()

    // Calculate benefits based on tier
    const tier = subscription?.subscription_tier || 0
    const isDirect = profile?.seller_type === 'direct'

    const benefits = {
      searchBoost: isDirect ? 1.50 : tier >= 100 ? 1.30 : tier >= 50 ? 1.15 : 1.00,
      feedPriority: isDirect ? 100 : tier >= 100 ? 80 : tier >= 50 ? 50 : 0,
      canBeFeatured: isDirect || tier >= 100,
      prioritySupport: tier >= 50,
      dedicatedManager: tier >= 100,
    }

    return NextResponse.json({
      tier,
      isDirect,
      subscriptionExpiresAt: subscription?.expires_at,
      promotionWeight: promotionWeight || null,
      benefits,
    })
  } catch (error: unknown) {
    console.error('[seller/promotion GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
