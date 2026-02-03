/**
 * Cron job: Check for sellers whose unfilled orders exceed their subscription tier
 * Should be called daily (e.g., via Vercel Cron)
 * Sends notifications to sellers who need to upgrade their subscription
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const { verifyCronSecret } = await import('@/lib/cron/verify-cron-secret')
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth

    const supabaseAdmin = await getSupabaseAdmin()
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting subscription downgrade check at', new Date().toISOString())
    }

    // Get all active seller subscriptions
    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, subscription_tier, expires_at')
      .eq('subscription_type', 'seller')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .not('subscription_tier', 'is', null)

    if (subscriptionsError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error fetching subscriptions:', subscriptionsError)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'check_subscription_downgrade',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: subscriptionsError.message,
        })
      } catch (_) {}
      logAudit({
        action: 'cron_check_subscription_downgrade',
        resourceType: 'cron',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: subscriptionsError.message },
      })
      return NextResponse.json(
        { error: subscriptionsError.message || 'Failed to fetch subscriptions' },
        { status: 500 }
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'check_subscription_downgrade',
          status: 'success',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          metadata: { checked_count: 0, notified_count: 0 },
        })
      } catch (_) {}
      logAudit({
        action: 'cron_check_subscription_downgrade',
        resourceType: 'cron',
        result: 'success',
        timestamp: new Date().toISOString(),
        meta: { checked_count: 0, notified_count: 0 },
      })
      return NextResponse.json({
        success: true,
        message: 'No active seller subscriptions to check',
        executionTime: duration,
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
            .eq('content_key', 'subscription_tier_exceeded')
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

            // Create notification (use content_key for i18n)
            await supabaseAdmin.from('notifications').insert({
              user_id: subscription.user_id,
              type: 'system',
              title: 'Subscription Tier Reminder',
              content: `Your unfilled orders total (${unfilledTotal.toFixed(2)} USD) exceeds your subscription tier (${subscriptionTier} USD). Consider upgrading to ${suggestedTier} USD tier.`,
              related_type: 'subscription',
              related_id: subscription.id,
              link: '/subscription/seller',
              content_key: 'subscription_tier_exceeded',
              content_params: {
                unfilledTotal: unfilledTotal.toFixed(2),
                currentTier: subscriptionTier.toString(),
                suggestedTier: suggestedTier.toString(),
              },
            })

            notifiedCount++
            if (process.env.NODE_ENV === 'development') {
              console.log('[Cron] Notified seller about tier upgrade')
            }
          }
        }
      } catch (error: unknown) {
        errors.push(`Seller ${subscription.user_id}: ${error instanceof Error ? error.message : String(error)}`)
        if (process.env.NODE_ENV === 'development') {
          console.error('[Cron] Error checking seller:', error)
        }
      }
    }

    const duration = Date.now() - startTime
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Subscription downgrade check completed in', duration, 'ms, checked:', checkedCount, 'notified:', notifiedCount)
    }
    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'check_subscription_downgrade',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          checked_count: checkedCount,
          notified_count: notifiedCount,
          error_count: errors.length,
        },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_check_subscription_downgrade',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { checked_count: checkedCount, notified_count: notifiedCount, error_count: errors.length },
    })

    return NextResponse.json({
      success: true,
      message: 'Subscription downgrade check completed',
      executionTime: duration,
      checkedCount,
      notifiedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Cron] Subscription downgrade check error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to check subscription downgrade'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'check_subscription_downgrade',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_check_subscription_downgrade',
      resourceType: 'cron',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { error: message },
    })
    return NextResponse.json(
      { error: message },
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
