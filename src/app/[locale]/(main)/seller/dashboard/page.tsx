'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSellerGuard } from '@/lib/hooks/useSellerGuard'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Package, ShoppingCart, DollarSign, TrendingUp, Users, CreditCard, Crown, Palette, Key, Star, UserCircle } from 'lucide-react'
import { PaymentAccountBanner, PayoutEligibility, PaymentAccountStatus } from '@/components/payment/PaymentAccountBanner'
import { StatsChart } from '@/components/stats/StatsChart'
import { Link, useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useState } from 'react'
import { SELLER_TIER_DETAILS } from '@/lib/subscriptions/pricing'

export enum SellerPayoutEligibility {
  ELIGIBLE = 'eligible',
  BLOCKED = 'blocked',
  PENDING_REVIEW = 'pending_review',
}

export interface SellerStatus {
  isDirectSeller: boolean
  hasActiveSubscription: boolean
  hasPaymentAccount: boolean
  eligibility: SellerPayoutEligibility | null
  shouldShowBanner: boolean
}

export default function SellerDashboard() {
  const { user, loading: authLoading, isSeller } = useSellerGuard()
  const { isDirectSeller, sellerTier, sellerExpiresAt } = useSubscription()
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()
  const supabase = createClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')

  // 获取卖家详细信息（支付账户等）
  const { data: sellerDetails, error: sellerDetailsError, isLoading: isLoadingSellerDetails } = useQuery({
    queryKey: ['sellerDetails', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          seller_type,
          payment_provider,
          payment_account_id,
          seller_payout_eligibility
        `)
        .eq('id', user.id)
        .single()
      
      if (error) throw error
      
      return {
        isDirectSeller: data.seller_type === 'direct',
        hasPaymentAccount: !!(data.payment_provider && data.payment_account_id),
        paymentProvider: data.payment_provider,
        eligibility: data.seller_payout_eligibility as PayoutEligibility | null,
        shouldShowBanner: data.seller_type === 'direct' || data.seller_type === 'subscription',
      }
    },
    enabled: !!user?.id,
  })

  // 处理收款账户状态
  const paymentAccountStatus: PaymentAccountStatus | null = sellerDetails && !sellerDetailsError ? {
    hasPaymentAccount: sellerDetails.hasPaymentAccount,
    paymentProvider: sellerDetails.paymentProvider || null,
    eligibility: sellerDetails.eligibility,
    shouldShowBanner: sellerDetails.shouldShowBanner,
  } : null

  // 3档纯净模式: 获取订阅和商品限制信息
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    tier: number | null
    tierName: string
    productLimit: number
    currentProductCount: number
    expiresAt: string | null
  } | null>(null)

  useEffect(() => {
    if (!user) return

    const fetchSubscriptionInfo = async () => {
      try {
        // 使用 Context 中的 isDirectSeller
        if (isDirectSeller) {
          setSubscriptionInfo(null) // 直营卖家不显示订阅信息
          return
        }

        // 获取商品数量
        const { count: productCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('seller_id', user.id)

        const tier = sellerTier
        const tierDetail = tier ? SELLER_TIER_DETAILS[tier] : null

        setSubscriptionInfo({
          tier,
          tierName: tierDetail?.name || '无订阅',
          productLimit: tierDetail?.productLimit || 0,
          currentProductCount: productCount || 0,
          expiresAt: sellerExpiresAt,
        })
      } catch (error) {
        console.error('Error fetching subscription info:', error)
      }
    }

    fetchSubscriptionInfo()
  }, [user, supabase, isDirectSeller, sellerTier, sellerExpiresAt])

  // 处理seller状态错误
  if (sellerDetailsError) {
    console.error('Failed to fetch seller details:', sellerDetailsError)
  }

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

  // Guard: 如果不是卖家，不渲染（layout 应该已经处理了）
  if (!isSeller) {
    return null
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 收款账户横幅 */}
      <PaymentAccountBanner
        status={paymentAccountStatus}
        isLoading={isLoadingSellerDetails}
        namespace="seller"
      />

      {/* 订阅信息卡片 */}
      {subscriptionInfo && (
        <Card className="mb-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{t('subscriptionInfo')}</h3>
              <p className="text-muted-foreground">
                {subscriptionInfo.tierName} · {subscriptionInfo.currentProductCount}/{subscriptionInfo.productLimit} {t('products')}
              </p>
              {subscriptionInfo.expiresAt && (
                <p className="text-sm text-muted-foreground">
                  {t('expiresAt')}: {new Date(subscriptionInfo.expiresAt).toLocaleDateString(locale)}
                </p>
              )}
            </div>
            <Link href="/subscription/manage">
              <Button variant="outline">{t('manageSubscription')}</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t('products')}</p>
              <p className="text-2xl font-bold">{stats?.productCount || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <ShoppingCart className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t('orders')}</p>
              <p className="text-2xl font-bold">{stats?.orderCount || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <DollarSign className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t('totalSales')}</p>
              <p className="text-2xl font-bold">${stats?.totalSales?.toFixed(2) || '0.00'}</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <TrendingUp className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">{t('pendingOrders')}</p>
              <p className="text-2xl font-bold">{stats?.pendingOrderCount || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 销售趋势图 */}
      <Card className="p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">{t('salesTrend')}</h3>
        <StatsChart title={t('salesChartTitle')} data={stats?.chartData || []} />
      </Card>

      {/* 快速操作 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/seller/products/create">
          <Card className="p-6 hover:bg-accent transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <h4 className="font-semibold">{t('createProduct')}</h4>
                <p className="text-sm text-muted-foreground">{t('createProductDesc')}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/seller/orders">
          <Card className="p-6 hover:bg-accent transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <ShoppingCart className="h-8 w-8 text-primary" />
              <div>
                <h4 className="font-semibold">{t('manageOrders')}</h4>
                <p className="text-sm text-muted-foreground">{t('manageOrdersDesc')}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/seller/payment-accounts">
          <Card className="p-6 hover:bg-accent transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <CreditCard className="h-8 w-8 text-primary" />
              <div>
                <h4 className="font-semibold">{t('paymentAccounts')}</h4>
                <p className="text-sm text-muted-foreground">{t('paymentAccountsDesc')}</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  )
}
