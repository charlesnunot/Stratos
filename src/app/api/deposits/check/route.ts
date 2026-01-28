/**
 * Deposit requirement check API
 * Provides a unified endpoint to check seller deposit requirements
 * Uses the same RPC function as order creation for consistency
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkSellerDepositRequirement } from '@/lib/deposits/check-deposit-requirement'

export const dynamic = 'force-dynamic'

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

    // Get Supabase admin client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Check deposit requirement with newOrderAmount = 0 (check current state)
    const depositCheck = await checkSellerDepositRequirement(user.id, 0, supabaseAdmin)

    // Also check if there's an existing deposit lot
    const { data: existingLot } = await supabaseAdmin
      .from('seller_deposit_lots')
      .select('*')
      .eq('seller_id', user.id)
      .eq('status', 'required')
      .order('required_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get subscription info for currency
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('subscription_tier, currency')
      .eq('user_id', user.id)
      .eq('subscription_type', 'seller')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('subscription_tier', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get unfilled orders total for display
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('total_amount')
      .eq('seller_id', user.id)
      .eq('payment_status', 'paid')
      .in('order_status', ['pending', 'paid', 'shipped'])

    const unfilledTotal = orders?.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0) || 0

    return NextResponse.json({
      requiresDeposit: depositCheck.requiresDeposit,
      requiredAmount: existingLot?.required_amount 
        ? parseFloat(existingLot.required_amount) 
        : depositCheck.requiredAmount,
      currentTier: depositCheck.currentTier,
      suggestedTier: depositCheck.suggestedTier,
      reason: depositCheck.reason,
      unfilledTotal,
      currency: subscription?.currency || 'USD',
      depositLot: existingLot ? {
        id: existingLot.id,
        requiredAmount: parseFloat(existingLot.required_amount),
        status: existingLot.status,
        requiredAt: existingLot.required_at,
      } : null,
    })
  } catch (error: any) {
    console.error('Deposit check error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check deposit requirement' },
      { status: 500 }
    )
  }
}
