/**
 * Seller API: Advanced Analytics Reports
 * GET: Get comprehensive analytics data
 * Only available for Scale ($100) tier sellers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Validate seller tier
async function validateSellerTier(supabase: any, userId: string): Promise<{ valid: boolean; error?: string }> {
  // Check if direct seller
  const { data: profile } = await supabase
    .from('profiles')
    .select('seller_type, role')
    .eq('id', userId)
    .single()

  if (profile?.seller_type === 'direct') {
    return { valid: true }
  }

  // Check subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .eq('subscription_type', 'seller')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()

  if (!subscription) {
    return { valid: false, error: 'No active seller subscription' }
  }

  const tier = subscription.subscription_tier
  
  // Only Scale (100) can use advanced analytics
  if (tier < 100) {
    return { valid: false, error: 'Advanced analytics requires Scale tier subscription' }
  }

  return { valid: true }
}

// Get sales trend data
async function getSalesTrend(supabase: any, sellerId: string, days: number = 30) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data: orders } = await supabase
    .from('orders')
    .select('created_at, total_amount, status')
    .eq('seller_id', sellerId)
    .eq('status', 'completed')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })

  // Group by date
  const dailySales: Record<string, { date: string; sales: number; orders: number; revenue: number }> = {}
  
  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    dailySales[dateStr] = { date: dateStr, sales: 0, orders: 0, revenue: 0 }
  }

  orders?.forEach((order: any) => {
    const dateStr = order.created_at.split('T')[0]
    if (dailySales[dateStr]) {
      dailySales[dateStr].sales += 1
      dailySales[dateStr].revenue += order.total_amount
    }
  })

  return Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date))
}

// Get product performance data
async function getProductPerformance(supabase: any, sellerId: string, limit: number = 10) {
  const { data: products } = await supabase
    .from('products')
    .select(`
      id,
      name,
      price,
      like_count,
      want_count,
      status,
      orders:orders(count)
    `)
    .eq('seller_id', sellerId)
    .order('like_count', { ascending: false })
    .limit(limit)

  return products?.map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    likes: p.like_count,
    wants: p.want_count,
    status: p.status,
    orderCount: p.orders?.[0]?.count || 0,
  })) || []
}

// Get customer insights
async function getCustomerInsights(supabase: any, sellerId: string) {
  // Get unique buyers
  const { data: uniqueBuyers } = await supabase
    .from('orders')
    .select('buyer_id')
    .eq('seller_id', sellerId)
    .eq('status', 'completed')

  const uniqueBuyerIds = [...new Set(uniqueBuyers?.map((o: any) => o.buyer_id) || [])]

  // Get repeat customers
  const { data: repeatCustomers } = await supabase.rpc('get_repeat_customers', {
    p_seller_id: sellerId,
  })

  // Get customer geography (if available)
  const { data: buyerProfiles } = await supabase
    .from('profiles')
    .select('country, region')
    .in('id', uniqueBuyerIds.slice(0, 100))

  const countryDistribution: Record<string, number> = {}
  buyerProfiles?.forEach((p: any) => {
    const country = p.country || 'Unknown'
    countryDistribution[country] = (countryDistribution[country] || 0) + 1
  })

  return {
    totalCustomers: uniqueBuyerIds.length,
    repeatCustomers: repeatCustomers?.length || 0,
    repeatRate: uniqueBuyerIds.length > 0 
      ? ((repeatCustomers?.length || 0) / uniqueBuyerIds.length * 100).toFixed(2)
      : 0,
    countryDistribution: Object.entries(countryDistribution)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  }
}

// Get revenue analytics
async function getRevenueAnalytics(supabase: any, sellerId: string) {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  // This month revenue
  const { data: thisMonthOrders } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('seller_id', sellerId)
    .eq('status', 'completed')
    .gte('created_at', thisMonthStart.toISOString())

  // Last month revenue
  const { data: lastMonthOrders } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('seller_id', sellerId)
    .eq('status', 'completed')
    .gte('created_at', lastMonthStart.toISOString())
    .lte('created_at', lastMonthEnd.toISOString())

  const thisMonthRevenue = thisMonthOrders?.reduce((sum: number, o: { total_amount: number }) => sum + o.total_amount, 0) || 0
  const lastMonthRevenue = lastMonthOrders?.reduce((sum: number, o: { total_amount: number }) => sum + o.total_amount, 0) || 0

  // Total revenue
  const { data: allOrders } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('seller_id', sellerId)
    .eq('status', 'completed')

  const totalRevenue = allOrders?.reduce((sum: number, o: { total_amount: number }) => sum + o.total_amount, 0) || 0

  // Growth rate
  const growthRate = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(2)
    : 0

  return {
    totalRevenue,
    thisMonthRevenue,
    lastMonthRevenue,
    growthRate,
    totalOrders: allOrders?.length || 0,
    thisMonthOrders: thisMonthOrders?.length || 0,
  }
}

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

    // Validate seller tier
    const tierCheck = await validateSellerTier(supabase, user.id)
    if (!tierCheck.valid) {
      return NextResponse.json({ error: tierCheck.error }, { status: 403 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    const reportType = searchParams.get('type') || 'full' // full, sales, products, customers, revenue

    let response: any = {}

    switch (reportType) {
      case 'sales':
        response = {
          salesTrend: await getSalesTrend(supabase, user.id, days),
        }
        break
      case 'products':
        response = {
          productPerformance: await getProductPerformance(supabase, user.id),
        }
        break
      case 'customers':
        response = {
          customerInsights: await getCustomerInsights(supabase, user.id),
        }
        break
      case 'revenue':
        response = {
          revenueAnalytics: await getRevenueAnalytics(supabase, user.id),
        }
        break
      case 'full':
      default:
        const [salesTrend, productPerformance, customerInsights, revenueAnalytics] = await Promise.all([
          getSalesTrend(supabase, user.id, days),
          getProductPerformance(supabase, user.id),
          getCustomerInsights(supabase, user.id),
          getRevenueAnalytics(supabase, user.id),
        ])
        response = {
          salesTrend,
          productPerformance,
          customerInsights,
          revenueAnalytics,
        }
        break
    }

    return NextResponse.json(response)
  } catch (error: unknown) {
    console.error('[seller/analytics GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
