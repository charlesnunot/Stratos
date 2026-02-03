'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, DollarSign, ShoppingBag, TrendingUp, Clock } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { StatsChart } from '@/components/stats/StatsChart'
import { formatCurrency } from '@/lib/currency/format-currency'

export default function AffiliateStatsPage() {
  const { user, loading: authLoading } = useAuthGuard()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const t = useTranslations('affiliate')
  const tCommon = useTranslations('common')

  const { data: stats, isLoading } = useQuery({
    queryKey: ['affiliateStats', user?.id],
    queryFn: async () => {
      if (!user) return null

      const [commissions, pendingCommissions, posts, recentCommissionsData] = await Promise.all([
        // Total paid commissions
        supabase
          .from('affiliate_commissions')
          .select('amount')
          .eq('affiliate_id', user.id)
          .eq('status', 'paid'),

        // Pending commissions
        supabase
          .from('affiliate_commissions')
          .select('amount')
          .eq('affiliate_id', user.id)
          .eq('status', 'pending'),

        // Affiliate posts count
        supabase
          .from('affiliate_posts')
          .select('*', { count: 'exact', head: true })
          .eq('affiliate_id', user.id),

        // Recent commissions for chart (last 7 days)
        supabase
          .from('affiliate_commissions')
          .select('amount, created_at, status')
          .eq('affiliate_id', user.id)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: true }),
      ])

      const totalEarnings = commissions.data?.reduce(
        (sum, c) => sum + (c.amount || 0),
        0
      ) || 0

      const pendingEarnings = pendingCommissions.data?.reduce(
        (sum, c) => sum + (c.amount || 0),
        0
      ) || 0

      // Group commissions by date for chart
      const commissionsByDate: Record<string, number> = {}
      recentCommissionsData.data?.forEach(commission => {
        if (commission.status === 'paid') {
          const date = new Date(commission.created_at).toISOString().split('T')[0]
          commissionsByDate[date] = (commissionsByDate[date] || 0) + (commission.amount || 0)
        }
      })

      // Create chart data for last 7 days
      const chartData = Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        const dateStr = date.toISOString().split('T')[0]
        return {
          date: dateStr,
          value: commissionsByDate[dateStr] || 0,
        }
      })

      return {
        totalEarnings,
        pendingEarnings,
        totalPosts: posts.count || 0,
        totalCommissions: (commissions.data?.length || 0) + (pendingCommissions.data?.length || 0),
        chartData,
      }
    },
    enabled: !!user,
  })

  const { data: recentCommissions } = useQuery({
    queryKey: ['recentCommissions', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('affiliate_commissions')
        .select(`
          *,
          order:orders(id, order_number, total_amount),
          product:products(id, name, images)
        `)
        .eq('affiliate_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return data || []
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
        <h1 className="text-2xl font-bold">{t('earningsPage')}</h1>
        <Link href="/affiliate/products">
          <Button variant="outline">{tCommon('browse')}</Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('totalEarnings')}</p>
              <p className="text-2xl font-bold">
                {formatCurrency(stats?.totalEarnings ?? 0, 'CNY')}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('pendingSettlement')}</p>
              <p className="text-2xl font-bold">
                {formatCurrency(stats?.pendingEarnings ?? 0, 'CNY')}
              </p>
            </div>
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('promotedOrders')}</p>
              <p className="text-2xl font-bold">{stats?.totalCommissions || 0}</p>
            </div>
            <ShoppingBag className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('affiliatePosts')}</p>
              <p className="text-2xl font-bold">{stats?.totalPosts || 0}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-600" />
          </div>
        </Card>
      </div>

      {/* Earnings Chart */}
      {stats?.chartData && stats.chartData.length > 0 && (
        <StatsChart title={t('chartTitle')} data={stats.chartData} color="hsl(142, 76%, 36%)" />
      )}

      {/* Recent Commissions */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('recentEarnings')}</h2>
        {!recentCommissions || recentCommissions.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">暂无收益记录</p>
        ) : (
          <div className="space-y-3">
            {recentCommissions.map((commission: any) => (
              <div
                key={commission.id}
                className="flex items-center justify-between border-b pb-3 last:border-0"
              >
                <div className="flex items-center gap-3">
                  {commission.product?.images?.[0] && (
                    <img
                      src={commission.product.images[0]}
                      alt={commission.product.name}
                      className="h-12 w-12 rounded object-cover"
                    />
                  )}
                  <div>
                    <p className="font-semibold">
                      {commission.product?.name || t('productLabel')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('orderLabel')}: {commission.order?.order_number || '-'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(commission.amount, 'CNY')}</p>
                  <p
                    className={`text-xs ${
                      commission.status === 'paid'
                        ? 'text-green-600'
                        : commission.status === 'pending'
                        ? 'text-yellow-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {commission.status === 'paid'
                      ? t('statusPaid')
                      : commission.status === 'pending'
                        ? t('statusPending')
                        : t('statusCancelled')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
