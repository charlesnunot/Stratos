'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, DollarSign, ShoppingCart, TrendingUp, BarChart3 } from 'lucide-react'
import { StatsChart } from '@/components/stats/StatsChart'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

type TimeRange = 7 | 30 | 90

interface OrderRow {
  id: string
  buyer_id: string
  product_id: string
  quantity: number
  total_amount: number
  order_status: string
  created_at: string
  product?: { id: string; name: string; images: string[] | null } | null
}

export default function SellerAnalyticsPage() {
  const { user, loading: authLoading } = useAuthGuard()
  const supabase = createClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const [timeRange, setTimeRange] = useState<TimeRange>(30)

  const startDate = useMemo(
    () => new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000).toISOString(),
    [timeRange]
  )

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['sellerAnalytics', user?.id, timeRange],
    queryFn: async () => {
      if (!user) return null

      const [
        ordersInPeriodRes,
        priorBuyersRes,
      ] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id,
            buyer_id,
            product_id,
            quantity,
            total_amount,
            order_status,
            created_at,
            product:products(id, name, images)
          `)
          .eq('seller_id', user.id)
          .gte('created_at', startDate)
          .order('created_at', { ascending: true }),

        supabase
          .from('orders')
          .select('buyer_id')
          .eq('seller_id', user.id)
          .lt('created_at', startDate),
      ])

      if (ordersInPeriodRes.error) throw ordersInPeriodRes.error
      const orders = (ordersInPeriodRes.data || []) as OrderRow[]
      const priorBuyerIds = new Set(
        (priorBuyersRes.data || []).map((r: { buyer_id: string }) => r.buyer_id)
      )

      const completed = orders.filter((o) => o.order_status === 'completed')
      const totalSales = completed.reduce((s, o) => s + (o.total_amount || 0), 0)
      const totalOrders = orders.length
      const completedCount = completed.length
      const avgOrderAmount = completedCount ? totalSales / completedCount : 0
      const completionRate = totalOrders ? (completedCount / totalOrders) * 100 : 0
      const avgOrderValue = totalOrders ? totalSales / totalOrders : 0

      const buyerOrderCount: Record<string, number> = {}
      const newBuyers = new Set<string>()
      orders.forEach((o) => {
        buyerOrderCount[o.buyer_id] = (buyerOrderCount[o.buyer_id] || 0) + 1
        if (!priorBuyerIds.has(o.buyer_id)) newBuyers.add(o.buyer_id)
      })
      const newCustomers = newBuyers.size
      const repeatCustomers = Object.values(buyerOrderCount).filter((c) => c > 1).length

      const salesByDate: Record<string, number> = {}
      const ordersByDate: Record<string, number> = {}
      completed.forEach((o) => {
        const d = new Date(o.created_at).toISOString().split('T')[0]
        salesByDate[d] = (salesByDate[d] || 0) + (o.total_amount || 0)
      })
      orders.forEach((o) => {
        const d = new Date(o.created_at).toISOString().split('T')[0]
        ordersByDate[d] = (ordersByDate[d] || 0) + 1
      })

      const n = timeRange
      const chartDates = Array.from({ length: n }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (n - 1 - i))
        return d.toISOString().split('T')[0]
      })
      const salesChartData = chartDates.map((date) => ({
        date,
        value: salesByDate[date] || 0,
      }))
      const ordersChartData = chartDates.map((date) => ({
        date,
        value: ordersByDate[date] || 0,
      }))

      const byQuantity: Record<string, { productId: string; qty: number; product?: OrderRow['product'] }> = {}
      const byRevenue: Record<string, { productId: string; revenue: number; product?: OrderRow['product'] }> = {}
      completed.forEach((o) => {
        const pid = o.product_id
        if (!byQuantity[pid]) {
          byQuantity[pid] = { productId: pid, qty: 0, product: o.product ?? undefined }
        }
        byQuantity[pid].qty += o.quantity || 0
        if (!byRevenue[pid]) {
          byRevenue[pid] = { productId: pid, revenue: 0, product: o.product ?? undefined }
        }
        byRevenue[pid].revenue += o.total_amount || 0
      })

      const topBySales = Object.values(byQuantity)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)
      const topByRevenue = Object.values(byRevenue)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)

      return {
        totalSales,
        totalOrders,
        avgOrderAmount,
        completionRate,
        newCustomers,
        repeatCustomers,
        avgOrderValue,
        salesChartData,
        ordersChartData,
        topBySales,
        topByRevenue,
      }
    },
    enabled: !!user,
  })

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return null

  const a = analytics

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('analyticsTitle')}</h1>
        <div className="flex gap-2">
          <Button
            variant={timeRange === 7 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange(7)}
          >
            {t('last7Days')}
          </Button>
          <Button
            variant={timeRange === 30 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange(30)}
          >
            {t('last30Days')}
          </Button>
          <Button
            variant={timeRange === 90 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange(90)}
          >
            {t('last90Days')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('totalSales')}</p>
              <p className="text-2xl font-bold">¥{(a?.totalSales ?? 0).toFixed(2)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('totalOrders')}</p>
              <p className="text-2xl font-bold">{a?.totalOrders ?? 0}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('averageOrderAmount')}</p>
              <p className="text-2xl font-bold">¥{(a?.avgOrderAmount ?? 0).toFixed(2)}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('completionRate')}</p>
              <p className="text-2xl font-bold">{(a?.completionRate ?? 0).toFixed(1)}%</p>
            </div>
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {a?.salesChartData && a.salesChartData.length > 0 && (
          <StatsChart title={t('salesTrend')} data={a.salesChartData} />
        )}
        {a?.ordersChartData && a.ordersChartData.length > 0 && (
          <StatsChart title={t('ordersTrend')} data={a.ordersChartData} color="hsl(262, 83%, 58%)" />
        )}
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('customerAnalysis')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">{t('newCustomers')}</p>
            <p className="text-xl font-bold">{a?.newCustomers ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('repeatCustomers')}</p>
            <p className="text-xl font-bold">{a?.repeatCustomers ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('averageOrderValue')}</p>
            <p className="text-xl font-bold">¥{(a?.avgOrderValue ?? 0).toFixed(2)}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('topProductsBySales')}</h2>
          {!a?.topBySales?.length ? (
            <p className="py-6 text-center text-muted-foreground">{tCommon('noData')}</p>
          ) : (
            <div className="space-y-3">
              {a.topBySales.map((item, i) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {item.product?.images?.[0] && (
                      <img
                        src={item.product.images[0]}
                        alt={item.product?.name ?? ''}
                        className="h-10 w-10 rounded object-cover"
                      />
                    )}
                    <span className="font-medium">{item.product?.name ?? '-'}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {t('quantity')}: {item.qty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('topProductsByRevenue')}</h2>
          {!a?.topByRevenue?.length ? (
            <p className="py-6 text-center text-muted-foreground">{tCommon('noData')}</p>
          ) : (
            <div className="space-y-3">
              {a.topByRevenue.map((item, i) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {item.product?.images?.[0] && (
                      <img
                        src={item.product.images[0]}
                        alt={item.product?.name ?? ''}
                        className="h-10 w-10 rounded object-cover"
                      />
                    )}
                    <span className="font-medium">{item.product?.name ?? '-'}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {t('revenue')}: ¥{item.revenue.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex justify-end">
        <Link href="/seller/dashboard">
          <Button variant="outline">{tCommon('back')}</Button>
        </Link>
      </div>
    </div>
  )
}
