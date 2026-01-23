'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { ProductCard } from '@/components/ecommerce/ProductCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, TrendingUp, DollarSign, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export function AffiliateCenter() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('affiliate')

  const { data: products, isLoading } = useQuery({
    queryKey: ['affiliateProducts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          seller:profiles!products_seller_id_fkey(username, display_name),
          affiliate_products(commission_rate)
        `)
        .eq('allow_affiliate', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
  })

  // Get affiliate stats
  const { data: stats } = useQuery({
    queryKey: ['affiliateStats', user?.id],
    queryFn: async () => {
      if (!user) return null

      const [earningsResult, ordersResult] = await Promise.all([
        // Total earnings
        supabase
          .from('affiliate_commissions')
          .select('amount')
          .eq('affiliate_id', user.id)
          .eq('status', 'paid'),

        // Total orders
        supabase
          .from('affiliate_commissions')
          .select('*', { count: 'exact', head: true })
          .eq('affiliate_id', user.id),
      ])

      if (earningsResult.error) throw earningsResult.error
      if (ordersResult.error) throw ordersResult.error

      const totalEarnings = earningsResult.data?.reduce(
        (sum, commission) => sum + (commission.amount || 0),
        0
      ) || 0

      return {
        totalEarnings,
        totalOrders: ordersResult.count || 0,
      }
    },
    enabled: !!user,
  })

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
        <h1 className="text-2xl font-bold">{t('affiliateCenter')}</h1>
        {user && (
          <Link href="/affiliate/stats">
            <Button variant="outline">
              <TrendingUp className="mr-2 h-4 w-4" />
              {t('viewEarnings')}
            </Button>
          </Link>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('totalEarnings')}</p>
                <p className="text-2xl font-bold">
                  ¥{stats.totalEarnings.toFixed(2)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('promotedOrders')}</p>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              </div>
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
        </div>
      )}

      {/* Products */}
      {!products || products.length === 0 ? (
        <Card className="p-12 text-center">
          <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t('noAffiliateProducts')}</p>
        </Card>
      ) : (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('foundXProducts', { count: products.length })}
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product: any) => {
              const commissionRate =
                product.affiliate_products?.[0]?.commission_rate ||
                product.commission_rate ||
                0

              return (
                <Card key={product.id} className="overflow-hidden">
                  <ProductCard product={product} />
                  <div className="p-4 border-t">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('commissionRate')}
                      </span>
                      <span className="font-semibold text-primary">
                        {commissionRate}%
                      </span>
                    </div>
                    <Link href={`/affiliate/products/${product.id}/promote`}>
                      <Button className="w-full" size="sm">
                        {t('createAffiliatePost')}
                      </Button>
                    </Link>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
