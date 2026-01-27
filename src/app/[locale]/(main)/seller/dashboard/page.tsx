'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSellerGuard } from '@/lib/hooks/useSellerGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Package, ShoppingCart, DollarSign, TrendingUp, Users, CreditCard, CheckCircle, AlertCircle, Clock, X, ChevronRight } from 'lucide-react'
import { StatsChart } from '@/components/stats/StatsChart'
import { Link, useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export default function SellerDashboard() {
  const { user, loading: authLoading, isSeller } = useSellerGuard()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')

  // 查询收款账户状态
  const { data: paymentAccountStatus } = useQuery({
    queryKey: ['sellerPaymentAccountStatus', user?.id],
    queryFn: async () => {
      if (!user) return null

      const { data: profile } = await supabase
        .from('profiles')
        .select('payment_provider, payment_account_id, seller_payout_eligibility, subscription_type')
        .eq('id', user.id)
        .single()

      if (!profile || profile.subscription_type !== 'seller') {
        return null
      }

      const hasAccount = !!(profile.payment_provider && profile.payment_account_id)
      const eligibility = profile.seller_payout_eligibility as 'eligible' | 'blocked' | 'pending_review' | null

      return {
        hasAccount,
        eligibility,
      }
    },
    enabled: !!user,
  })

  const { data: stats, isLoading, error: statsError } = useQuery({
    queryKey: ['sellerStats', user?.id],
    queryFn: async () => {
      if (!user) return null

      const [products, orders, sales, pendingOrders, monthlySales] = await Promise.allSettled([
        // Product count
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('seller_id', user.id),

        // Order count (all statuses)
        supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('seller_id', user.id),

        // Total sales (completed orders)
        supabase
          .from('orders')
          .select('total_amount, created_at')
          .eq('seller_id', user.id)
          .eq('order_status', 'completed'),

        // Pending orders
        supabase
          .from('orders')
          .select('total_amount', { count: 'exact', head: true })
          .eq('seller_id', user.id)
          .eq('order_status', 'pending'),

        // Monthly sales for chart (last 7 days)
        supabase
          .from('orders')
          .select('total_amount, created_at')
          .eq('seller_id', user.id)
          .eq('order_status', 'completed')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: true }),
      ])

      // 处理 Promise.allSettled 结果
      const productsResult = products.status === 'fulfilled' ? products.value : null
      const ordersResult = orders.status === 'fulfilled' ? orders.value : null
      const salesResult = sales.status === 'fulfilled' ? sales.value : null
      const pendingOrdersResult = pendingOrders.status === 'fulfilled' ? pendingOrders.value : null
      const monthlySalesResult = monthlySales.status === 'fulfilled' ? monthlySales.value : null

      // 如果有错误，记录但不抛出（部分数据仍可显示）
      if (products.status === 'rejected') console.error('Failed to fetch products:', products.reason)
      if (orders.status === 'rejected') console.error('Failed to fetch orders:', orders.reason)
      if (sales.status === 'rejected') console.error('Failed to fetch sales:', sales.reason)
      if (pendingOrders.status === 'rejected') console.error('Failed to fetch pending orders:', pendingOrders.reason)
      if (monthlySales.status === 'rejected') console.error('Failed to fetch monthly sales:', monthlySales.reason)

      const totalSales = salesResult?.data?.reduce(
        (sum, order) => sum + (order.total_amount || 0),
        0
      ) || 0

      // Group monthly sales by date
      const salesByDate: Record<string, number> = {}
      monthlySalesResult?.data?.forEach(order => {
        const date = new Date(order.created_at).toISOString().split('T')[0]
        salesByDate[date] = (salesByDate[date] || 0) + (order.total_amount || 0)
      })

      // Create chart data for last 7 days
      const chartData = Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        const dateStr = date.toISOString().split('T')[0]
        return {
          date: dateStr,
          value: salesByDate[dateStr] || 0,
        }
      })

      return {
        productCount: productsResult?.count || 0,
        orderCount: ordersResult?.count || 0,
        pendingOrderCount: pendingOrdersResult?.count || 0,
        totalSales,
        chartData,
      }
    },
    enabled: !!user && isSeller,
    retry: 2,
  })

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show nothing if not authenticated (redirect is handled in useEffect)
  if (!user) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 显示错误状态
  if (statsError && !stats) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive mb-4">加载统计数据失败</p>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
        >
          刷新页面
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 收款账户状态横幅 */}
      {paymentAccountStatus && (
        <Card
          className={
            !paymentAccountStatus.hasAccount
              ? 'border-2 border-yellow-500 bg-yellow-50'
              : paymentAccountStatus.eligibility === 'blocked'
              ? 'border-2 border-red-500 bg-red-50'
              : paymentAccountStatus.eligibility === 'pending_review'
              ? 'border-2 border-yellow-500 bg-yellow-50'
              : paymentAccountStatus.eligibility === 'eligible'
              ? 'border-2 border-green-500 bg-green-50'
              : 'border-2 border-yellow-500 bg-yellow-50'
          }
        >
          {!paymentAccountStatus.hasAccount ? (
            <Link href="/seller/payment-accounts">
              <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-yellow-900">🟡 未绑定收款方式</p>
                  <p className="text-xs text-yellow-700">点击绑定收款账户以开始接收买家付款</p>
                </div>
                <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              </div>
            </Link>
          ) : paymentAccountStatus.eligibility === 'blocked' ? (
            <Link href="/seller/payment-accounts">
              <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
                <X className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-900">🔴 收款账户不可用</p>
                  <p className="text-xs text-red-700">您的收款账户已被禁用，无法接收付款</p>
                </div>
                <ChevronRight className="h-5 w-5 text-red-600 flex-shrink-0" />
              </div>
            </Link>
          ) : paymentAccountStatus.eligibility === 'pending_review' ? (
            <Link href="/seller/payment-accounts">
              <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
                <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-yellow-900">🟡 收款账户审核中</p>
                  <p className="text-xs text-yellow-700">您的收款账户正在审核中，审核完成后即可开始接收付款</p>
                </div>
                <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              </div>
            </Link>
          ) : paymentAccountStatus.eligibility === 'eligible' ? (
            <div className="flex items-center gap-3 p-4">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-900">🟢 可正常收款</p>
                <p className="text-xs text-green-700">您的收款账户状态正常，可以接收买家付款</p>
              </div>
            </div>
          ) : null}
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('sellerCenter')}</h1>
        <div className="flex gap-2">
          <Link href="/seller/products/create">
            <Button>{t('createProduct')}</Button>
          </Link>
          <Link href="/seller/products">
            <Button variant="outline">{t('myProducts')}</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('myProducts')}</p>
              <p className="text-2xl font-bold">{stats?.productCount || 0}</p>
            </div>
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">总订单数</p>
              <p className="text-2xl font-bold">{stats?.orderCount || 0}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">待处理订单</p>
              <p className="text-2xl font-bold">{stats?.pendingOrderCount || 0}</p>
            </div>
            <CreditCard className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">总销售额</p>
              <p className="text-2xl font-bold">
                ¥{stats?.totalSales.toFixed(2) || '0.00'}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>
      </div>

      {/* Sales Chart */}
      {stats?.chartData && stats.chartData.length > 0 && (
        <StatsChart title="近7天销售额" data={stats.chartData} />
      )}

      {/* Recent Orders */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('recentOrders')}</h2>
        <Link href="/seller/orders">
          <Button variant="outline">{tCommon('view')}</Button>
        </Link>
      </Card>

      {/* Quick Actions */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('quickActions')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Link href="/seller/products/create">
            <Button variant="outline" className="w-full justify-start">
              <Package className="mr-2 h-4 w-4" />
              {t('createProduct')}
            </Button>
          </Link>
          <Link href="/seller/payment-accounts">
            <Button variant="outline" className="w-full justify-start">
              <DollarSign className="mr-2 h-4 w-4" />
              管理收款账户
            </Button>
          </Link>
          <Link href="/seller/affiliate-settings">
            <Button variant="outline" className="w-full justify-start">
              <TrendingUp className="mr-2 h-4 w-4" />
              带货设置
            </Button>
          </Link>
          <Link href="/seller/analytics">
            <Button variant="outline" className="w-full justify-start">
              <TrendingUp className="mr-2 h-4 w-4" />
              销售分析
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
