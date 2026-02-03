/**
 * Cron job: Expire subscriptions and sync affected user profiles
 * Should be called daily (e.g., via Vercel Cron)
 * This addresses Risk 1: expired subscriptions still marked as 'active'
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

    // Call database function to expire subscriptions and sync profiles
    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Starting subscription lifecycle check at', new Date().toISOString())
    }

    const { data, error } = await supabaseAdmin.rpc('expire_subscriptions_and_sync_profiles')

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron] Error expiring subscriptions:', error)
      }
      const duration = Date.now() - startTime
      try {
        await supabaseAdmin.from('cron_logs').insert({
          job_name: 'subscription_lifecycle',
          status: 'failed',
          execution_time_ms: duration,
          executed_at: new Date().toISOString(),
          error_message: error.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: error.message || 'Failed to expire subscriptions' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const expiredCount = data?.[0]?.expired_count || 0
    const affectedUserIds = data?.[0]?.affected_user_ids || []

    if (process.env.NODE_ENV === 'development') {
      console.log('[Cron] Subscription lifecycle check completed in', duration, 'ms, expired:', expiredCount, 'affected:', Array.isArray(affectedUserIds) ? affectedUserIds.length : 0)
    }

    try {
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'subscription_lifecycle',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: {
          expired_count: expiredCount,
          affected_users_count: Array.isArray(affectedUserIds) ? affectedUserIds.length : 0,
        },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_subscription_lifecycle',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { expired_count: expiredCount, affected_users_count: Array.isArray(affectedUserIds) ? affectedUserIds.length : 0 },
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Subscriptions expired and profiles synced',
      expiredCount,
      affectedUsersCount: Array.isArray(affectedUserIds) ? affectedUserIds.length : 0,
      executionTime: duration 
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Cron] Subscription lifecycle job error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to expire subscriptions'
    try {
      const supabaseAdmin = await getSupabaseAdmin()
      await supabaseAdmin.from('cron_logs').insert({
        job_name: 'subscription_lifecycle',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_subscription_lifecycle',
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
