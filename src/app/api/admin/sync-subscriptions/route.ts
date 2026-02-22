import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit } from '@/lib/api/audit'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Admin endpoint: manually sync subscription-derived profile fields.
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

    let syncedCount = 0
    const errors: string[] = []

    for (const userId of userIds) {
      try {
        const { error } = await supabaseAdmin.rpc('sync_profile_subscription_derived', {
          p_user_id: userId,
        })

        if (error) {
          errors.push(`User ${userId}: ${error.message}`)
        } else {
          syncedCount++
        }
      } catch (error) {
        errors.push(`User ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    logAudit({
      action: 'admin_sync_subscriptions',
      userId: adminUserId,
      resourceType: 'subscription_sync',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        userCount: userIds.length,
        syncedCount,
        errorCount: errors.length,
      },
    })

    return NextResponse.json({
      success: true,
      syncedCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Manual sync subscriptions failed:', error)
    logAudit({
      action: 'admin_sync_subscriptions',
      userId: adminUserId,
      resourceType: 'subscription_sync',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { error: error instanceof Error ? error.message : String(error) },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Admin endpoint: get users with active subscriptions for manual sync scope.
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
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const supabaseAdmin = await getSupabaseAdmin()

    const { data: activeSubscriptions, error: subsError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())

    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 500 })
    }

    const userIdsWithActiveSubscriptions = activeSubscriptions?.map((sub) => sub.user_id) || []

    const { data: usersWithSubscriptions, error } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, username, display_name, seller_subscription_active, affiliate_subscription_active, tip_subscription_active'
      )
      .in('id', userIdsWithActiveSubscriptions)
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logAudit({
      action: 'admin_sync_subscriptions_scope',
      userId: adminUserId,
      resourceType: 'subscription_sync',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        limit,
        activeSubscriptionUserCount: userIdsWithActiveSubscriptions.length,
        returnedCount: usersWithSubscriptions?.length || 0,
      },
    })

    return NextResponse.json({
      users: usersWithSubscriptions,
      total: usersWithSubscriptions?.length || 0,
    })
  } catch (error) {
    console.error('Get users for subscription sync failed:', error)
    logAudit({
      action: 'admin_sync_subscriptions_scope',
      userId: adminUserId,
      resourceType: 'subscription_sync',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { error: error instanceof Error ? error.message : String(error) },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
