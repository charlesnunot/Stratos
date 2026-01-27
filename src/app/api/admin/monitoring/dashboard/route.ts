/**
 * API endpoint for system monitoring dashboard
 * Provides key metrics and health status for administrators
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Get key metrics
    const [
      totalOrders,
      ordersLast24h,
      pendingOrders,
      expiredOrders,
      totalUsers,
      activeSellers,
      totalRevenue,
      revenueLast24h,
      pendingRefunds,
      activeDisputes,
      pendingDeposits,
      cronJobsStatus,
    ] = await Promise.all([
      // Total orders
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true }),

      // Orders in last 24 hours
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', last24Hours.toISOString()),

      // Pending orders
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('payment_status', 'pending')
        .eq('order_status', 'pending'),

      // Expired orders (not yet cancelled)
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('payment_status', 'pending')
        .eq('order_status', 'pending')
        .not('expires_at', 'is', null)
        .lt('expires_at', now.toISOString()),

      // Total users
      supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true }),

      // Active sellers
      supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'seller'),

      // Total revenue (from paid orders)
      supabaseAdmin
        .from('orders')
        .select('total_amount, currency')
        .eq('payment_status', 'paid'),

      // Revenue in last 24 hours
      supabaseAdmin
        .from('orders')
        .select('total_amount, currency')
        .eq('payment_status', 'paid')
        .gte('paid_at', last24Hours.toISOString()),

      // Pending refunds
      supabaseAdmin
        .from('order_refunds')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),

      // Active disputes
      supabaseAdmin
        .from('order_disputes')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'reviewing']),

      // Pending deposits
      supabaseAdmin
        .from('seller_deposit_lots')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),

      // Cron jobs status (last 24 hours)
      supabaseAdmin
        .from('cron_logs')
        .select('job_name, status, executed_at, execution_time_ms')
        .gte('executed_at', last24Hours.toISOString())
        .order('executed_at', { ascending: false })
        .limit(50),
    ])

    // Calculate revenue (convert to USD for consistency)
    interface OrderAmount {
      total_amount: number | string | null
      currency?: string
    }
    const calculateRevenue = (orders: OrderAmount[]): number => {
      // Simple calculation - in production, should convert all currencies to USD
      return orders.reduce((sum, order) => sum + (parseFloat(String(order.total_amount || 0))), 0)
    }

    const totalRevenueAmount = calculateRevenue(totalRevenue.data || [])
    const revenue24hAmount = calculateRevenue(revenueLast24h.data || [])

    // Get cron job health status
    interface CronLog {
      job_name: string
      status: string
      executed_at: string
      execution_time_ms: number | null
    }
    interface CronJobHealth {
      lastExecution: string
      lastStatus: string
      executionTime: number | null
      successCount: number
      failureCount: number
    }
    const cronJobsHealth = (cronJobsStatus.data || []).reduce((acc: Record<string, CronJobHealth>, log: CronLog) => {
      if (!acc[log.job_name]) {
        acc[log.job_name] = {
          lastExecution: log.executed_at,
          lastStatus: log.status,
          executionTime: log.execution_time_ms,
          successCount: 0,
          failureCount: 0,
        }
      }
      if (log.status === 'success') {
        acc[log.job_name].successCount++
      } else {
        acc[log.job_name].failureCount++
      }
      return acc
    }, {})

    // System health status
    const healthStatus = {
      overall: 'healthy' as 'healthy' | 'warning' | 'critical',
      issues: [] as string[],
    }

    // Check for issues
    if ((expiredOrders.count || 0) > 10) {
      healthStatus.overall = 'warning'
      healthStatus.issues.push(`有 ${expiredOrders.count} 个过期订单待处理`)
    }

    if ((pendingRefunds.count || 0) > 20) {
      healthStatus.overall = 'warning'
      healthStatus.issues.push(`有 ${pendingRefunds.count} 个待处理退款`)
    }

    if ((activeDisputes.count || 0) > 50) {
      healthStatus.overall = 'warning'
      healthStatus.issues.push(`有 ${activeDisputes.count} 个活跃争议`)
    }

    // Check cron jobs
    const failedCronJobs = Object.entries(cronJobsHealth).filter(
      ([_, status]: [string, CronJobHealth]) => status.failureCount > 0
    )
    if (failedCronJobs.length > 0) {
      healthStatus.overall = 'critical'
      healthStatus.issues.push(`有 ${failedCronJobs.length} 个定时任务执行失败`)
    }

    return NextResponse.json({
      success: true,
      metrics: {
        orders: {
          total: totalOrders.count || 0,
          last24h: ordersLast24h.count || 0,
          pending: pendingOrders.count || 0,
          expired: expiredOrders.count || 0,
        },
        users: {
          total: totalUsers.count || 0,
          activeSellers: activeSellers.count || 0,
        },
        revenue: {
          total: totalRevenueAmount,
          last24h: revenue24hAmount,
        },
        issues: {
          pendingRefunds: pendingRefunds.count || 0,
          activeDisputes: activeDisputes.count || 0,
          pendingDeposits: pendingDeposits.count || 0,
        },
        cronJobs: cronJobsHealth,
      },
      health: healthStatus,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error('Monitoring dashboard error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch monitoring data' },
      { status: 500 }
    )
  }
}
