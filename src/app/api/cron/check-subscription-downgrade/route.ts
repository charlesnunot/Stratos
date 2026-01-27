/**
 * Cron job: Check for sellers whose unfilled orders exceed their subscription tier
 * Should be called daily (e.g., via Vercel Cron)
 * Sends notifications to sellers who need to upgrade their subscription
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (if using Vercel Cron)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const startTime = Date.now()
    console.log('[Cron] Starting subscription downgrade check at', new Date().toISOString())

    // Get all active seller subscriptions
    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, subscription_tier, expires_at')
      .eq('subscription_type', 'seller')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .not('subscription_tier', 'is', null)

    if (subscriptionsError) {
      console.error('[Cron] Error fetching subscriptions:', subscriptionsError)
      return NextResponse.json(
        { error: subscriptionsError.message || 'Failed to fetch subscriptions' },
        { status: 500 }
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active seller subscriptions to check',
        executionTime: Date.now() - startTime,
        checkedCount: 0,
        notifiedCount: 0,
      })
    }

    let checkedCount = 0
    let notifiedCount = 0
    const errors: string[] = []

    // Check each seller's unfilled orders
    for (const subscription of subscriptions) {
      try {
        checkedCount++

        // Get unfilled orders total using database function
        const { data: unfilledTotalResult, error: unfilledError } = await supabaseAdmin.rpc(
          'get_unfilled_orders_total',
          {
            p_seller_id: subscription.user_id,
          }
        )

        if (unfilledError) {
          errors.push(`Seller ${subscription.user_id}: ${unfilledError.message}`)
          continue
        }

        const unfilledTotal = parseFloat(String(unfilledTotalResult || 0))
        const subscriptionTier = parseFloat(String(subscription.subscription_tier || 0))

        // Check if unfilled orders exceed subscription tier
        if (unfilledTotal > subscriptionTier) {
          // Check if we've already notified this seller recently (within last 7 days)
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          const { data: recentNotification } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('user_id', subscription.user_id)
            .eq('type', 'system')
            .eq('related_type', 'subscription')
            .like('title', '%订阅档位%')
            .gte('created_at', sevenDaysAgo)
            .limit(1)
            .maybeSingle()

          // Only send notification if we haven't notified recently
          if (!recentNotification) {
            // Calculate suggested tier
            const suggestedTier = getSuggestedTier(unfilledTotal)

            // Get seller profile for display name
            const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('display_name, username')
              .eq('id', subscription.user_id)
              .single()

            const sellerName = profile?.display_name || profile?.username || '卖家'

            // Create notification
            await supabaseAdmin.from('notifications').insert({
              user_id: subscription.user_id,
              type: 'system',
              title: '订阅档位提醒',
              content: `您的未完成订单总额（${unfilledTotal.toFixed(2)} USD）已超过当前订阅档位（${subscriptionTier} USD）。建议升级到 ${suggestedTier} USD 档位以继续正常销售。`,
              related_type: 'subscription',
              related_id: subscription.id,
              link: '/subscription/seller',
            })

            notifiedCount++
            console.log(`[Cron] Notified seller ${subscription.user_id} about tier upgrade needed`)
          }
        }
      } catch (error: any) {
        errors.push(`Seller ${subscription.user_id}: ${error.message}`)
        console.error(`[Cron] Error checking seller ${subscription.user_id}:`, error)
      }
    }

    const duration = Date.now() - startTime
    console.log('[Cron] Subscription downgrade check completed in', duration, 'ms')
    console.log('[Cron] Checked:', checkedCount, 'Notified:', notifiedCount)

    // Log execution result
    await supabaseAdmin
      .from('cron_logs')
      .insert({
        job_name: 'check_subscription_downgrade',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          checked_count: checkedCount,
          notified_count: notifiedCount,
          errors: errors.length > 0 ? errors : undefined,
        },
      })
      .catch((logError) => {
        // Ignore log errors - cron_logs table might not exist
        console.warn('[Cron] Failed to log execution:', logError)
      })

    return NextResponse.json({
      success: true,
      message: 'Subscription downgrade check completed',
      executionTime: duration,
      checkedCount,
      notifiedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[Cron] Subscription downgrade check error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check subscription downgrade' },
      { status: 500 }
    )
  }
}

/**
 * Get suggested subscription tier based on total amount
 */
function getSuggestedTier(totalAmount: number): number {
  if (totalAmount <= 10) return 10
  if (totalAmount <= 20) return 20
  if (totalAmount <= 50) return 50
  if (totalAmount <= 100) return 100
  if (totalAmount <= 300) return 300
  return 300 // Highest tier
}
