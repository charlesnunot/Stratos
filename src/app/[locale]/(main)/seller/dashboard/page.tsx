'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Package, ShoppingCart, DollarSign, TrendingUp, Users, CreditCard } from 'lucide-react'
import { StatsChart } from '@/components/stats/StatsChart'
import { Link, useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export default function SellerDashboard() {
  const { user, loading: authLoading } = useAuthGuard()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')

  const { data: stats, isLoading } = useQuery({
    queryKey: ['sellerStats', user?.id],
    queryFn: async () => {
      if (!user) return null

      const [products, orders, sales, pendingOrders, monthlySales] = await Promise.all([
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

      const totalSales = sales.data?.reduce(
        (sum, order) => sum + (order.total_amount || 0),
        0
      ) || 0

      // Group monthly sales by date
      const salesByDate: Record<string, number> = {}
      monthlySales.data?.forEach(order => {
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
        productCount: products.count || 0,
        orderCount: orders.count || 0,
        pendingOrderCount: pendingOrders.count || 0,
        totalSales,
        chartData,
      }
    },
    enabled: !!user,
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

  return (
    <div className="space-y-6">
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
