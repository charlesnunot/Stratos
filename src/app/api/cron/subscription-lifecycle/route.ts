/**
 * Cron job: Expire subscriptions and sync affected user profiles
 * Should be called daily (e.g., via Vercel Cron)
 * This addresses Risk 1: expired subscriptions still marked as 'active'
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

    // Call database function to expire subscriptions and sync profiles
    const startTime = Date.now()
    console.log('[Cron] Starting subscription lifecycle check at', new Date().toISOString())
    
    const { data, error } = await supabaseAdmin.rpc('expire_subscriptions_and_sync_profiles')

    if (error) {
      console.error('[Cron] Error expiring subscriptions:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to expire subscriptions' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    const expiredCount = data?.[0]?.expired_count || 0
    const affectedUserIds = data?.[0]?.affected_user_ids || []

    console.log('[Cron] Subscription lifecycle check completed in', duration, 'ms')
    console.log('[Cron] Expired subscriptions:', expiredCount, 'Affected users:', affectedUserIds.length)

    // Log execution result
    await supabaseAdmin.from('cron_logs').insert({
      job_name: 'subscription_lifecycle',
      status: 'success',
      execution_time_ms: duration,
      executed_at: new Date().toISOString(),
      metadata: {
        expired_count: expiredCount,
        affected_users_count: affectedUserIds.length,
      },
    }).catch((logError) => {
      // Ignore log errors - cron_logs table might not exist
      console.warn('[Cron] Failed to log execution:', logError)
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Subscriptions expired and profiles synced',
      expiredCount,
      affectedUsersCount: affectedUserIds.length,
      executionTime: duration 
    })
  } catch (error: any) {
    console.error('[Cron] Subscription lifecycle job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to expire subscriptions' },
      { status: 500 }
    )
  }
}
