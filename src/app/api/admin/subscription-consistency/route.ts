import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit } from '@/lib/api/audit'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Admin endpoint: check and optionally fix profile/subscription consistency.
 */
export async function GET(request: NextRequest) {
  let adminUserId: string | undefined
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    adminUserId = authResult.data.user.id

    const { searchParams } = new URL(request.url)
    const fix = searchParams.get('fix') === 'true'
    const userId = searchParams.get('userId')

    const supabaseAdmin = await getSupabaseAdmin()

    let query = supabaseAdmin
      .from('profiles')
      .select(`
        id,
        username,
        display_name,
        seller_subscription_active,
        seller_subscription_expires_at,
        affiliate_subscription_active,
        affiliate_subscription_expires_at,
        tip_subscription_active,
        tip_subscription_expires_at,
        subscription_type,
        subscription_expires_at
      `)

    if (userId) {
      query = query.eq('id', userId)
    }

    const { data: profiles, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const inconsistencies: Array<{
      userId: string
      username: string | null
      displayName: string | null
      inconsistencies: Array<{
        type: 'seller_subscription' | 'affiliate_subscription' | 'tip_subscription'
        expected: boolean
        actual: boolean
        description: string
      }>
    }> = []

    const fixedUsers: Array<{ userId: string; type: string; fixed: true }> = []

    for (const profile of profiles || []) {
      const inconsistenciesForUser: Array<{
        type: 'seller_subscription' | 'affiliate_subscription' | 'tip_subscription'
        expected: boolean
        actual: boolean
        description: string
      }> = []

      const { data: sellerSubscriptions } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status, expires_at')
        .eq('user_id', profile.id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())

      const hasActiveSellerSubscription = (sellerSubscriptions?.length || 0) > 0
      const profileSellerActive = profile.seller_subscription_active === true

      if (hasActiveSellerSubscription !== profileSellerActive) {
        inconsistenciesForUser.push({
          type: 'seller_subscription',
          expected: hasActiveSellerSubscription,
          actual: profileSellerActive,
          description: 'Seller subscription status is inconsistent',
        })

        if (fix) {
          await supabaseAdmin.rpc('sync_profile_subscription_derived', {
            p_user_id: profile.id,
          })
          fixedUsers.push({ userId: profile.id, type: 'seller_subscription', fixed: true })
        }
      }

      const { data: affiliateSubscriptions } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status, expires_at')
        .eq('user_id', profile.id)
        .eq('subscription_type', 'affiliate')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())

      const hasActiveAffiliateSubscription = (affiliateSubscriptions?.length || 0) > 0
      const profileAffiliateActive = profile.affiliate_subscription_active === true

      if (hasActiveAffiliateSubscription !== profileAffiliateActive) {
        inconsistenciesForUser.push({
          type: 'affiliate_subscription',
          expected: hasActiveAffiliateSubscription,
          actual: profileAffiliateActive,
          description: 'Affiliate subscription status is inconsistent',
        })

        if (fix) {
          await supabaseAdmin.rpc('sync_profile_subscription_derived', {
            p_user_id: profile.id,
          })
          fixedUsers.push({ userId: profile.id, type: 'affiliate_subscription', fixed: true })
        }
      }

      const { data: tipSubscriptions } = await supabaseAdmin
        .from('subscriptions')
        .select('id, status, expires_at')
        .eq('user_id', profile.id)
        .eq('subscription_type', 'tip')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())

      const hasActiveTipSubscription = (tipSubscriptions?.length || 0) > 0
      const profileTipActive = profile.tip_subscription_active === true

      if (hasActiveTipSubscription !== profileTipActive) {
        inconsistenciesForUser.push({
          type: 'tip_subscription',
          expected: hasActiveTipSubscription,
          actual: profileTipActive,
          description: 'Tip subscription status is inconsistent',
        })

        if (fix) {
          await supabaseAdmin.rpc('sync_profile_subscription_derived', {
            p_user_id: profile.id,
          })
          fixedUsers.push({ userId: profile.id, type: 'tip_subscription', fixed: true })
        }
      }

      if (inconsistenciesForUser.length > 0) {
        inconsistencies.push({
          userId: profile.id,
          username: profile.username,
          displayName: profile.display_name,
          inconsistencies: inconsistenciesForUser,
        })
      }
    }

    const response = {
      success: true,
      checkedCount: profiles?.length || 0,
      inconsistencyCount: inconsistencies.length,
      inconsistencies,
      fixedUsers: fix ? fixedUsers : undefined,
      fixApplied: fix,
    }

    logAudit({
      action: 'admin_subscription_consistency_check',
      userId: adminUserId,
      resourceType: 'subscription_consistency',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        fixApplied: fix,
        targetUserId: userId || null,
        checkedCount: response.checkedCount,
        inconsistencyCount: response.inconsistencyCount,
      },
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('Subscription consistency check failed:', error)
    logAudit({
      action: 'admin_subscription_consistency_check',
      userId: adminUserId,
      resourceType: 'subscription_consistency',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { error: error instanceof Error ? error.message : String(error) },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Admin endpoint: manually sync profile derived subscription fields for specific users.
 */
export async function POST(request: NextRequest) {
  let adminUserId: string | undefined
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    adminUserId = authResult.data.user.id

    const { userIds } = await request.json()

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'userIds parameter is required and must be a non-empty array' },
        { status: 400 }
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()

    const results: Array<{ userId: string; success: boolean; error?: string }> = []

    for (const userId of userIds) {
      try {
        const { error } = await supabaseAdmin.rpc('sync_profile_subscription_derived', {
          p_user_id: userId,
        })

        if (error) {
          results.push({ userId, success: false, error: error.message })
        } else {
          results.push({ userId, success: true })
        }
      } catch (error) {
        results.push({
          userId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const errorCount = results.filter((r) => !r.success).length

    const response = {
      success: true,
      results,
      summary: {
        total: results.length,
        success: successCount,
        error: errorCount,
      },
    }

    logAudit({
      action: 'admin_subscription_consistency_sync',
      userId: adminUserId,
      resourceType: 'subscription_consistency',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        userCount: Array.isArray(userIds) ? userIds.length : 0,
        successCount,
        errorCount,
      },
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('Manual subscription consistency fix failed:', error)
    logAudit({
      action: 'admin_subscription_consistency_sync',
      userId: adminUserId,
      resourceType: 'subscription_consistency',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { error: error instanceof Error ? error.message : String(error) },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
