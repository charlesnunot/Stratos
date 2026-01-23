'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Package } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export default function SellerOrdersPage() {
  const { user, loading: authLoading } = useAuthGuard()
  const supabase = createClient()
  const t = useTranslations('orders')
  const tCommon = useTranslations('common')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['sellerOrders', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          product:products(id, name, images),
          buyer:profiles!orders_buyer_id_fkey(display_name)
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'text-yellow-600',
      paid: 'text-blue-600',
      shipped: 'text-purple-600',
      completed: 'text-green-600',
      cancelled: 'text-red-600',
    }
    return colors[status] || 'text-gray-600'
  }

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: t('pending'),
      paid: t('paid'),
      shipped: t('shipped'),
      completed: t('completed'),
      cancelled: t('cancelled'),
    }
    return statusMap[status] || status
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('myOrders')}</h1>
      {!orders || orders.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t('noOrders')}</p>
          <Link href="/seller/dashboard">
            <Button variant="outline" className="mt-4">
              {tCommon('back')}
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {(orders as any[]).map((order: any) => (
            <Card key={order.id} className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-start">
                  {order.product?.images?.[0] && (
                    <img
                      src={order.product.images[0]}
                      alt={order.product.name}
                      className="h-20 w-20 shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-semibold hover:underline"
                      >
                        {t('orderNumber')}: {order.order_number}
                      </Link>
                      <span
                        className={`text-sm font-medium ${getStatusColor(
                          order.order_status
                        )}`}
                      >
                        {getStatusText(order.order_status)}
                      </span>
                    </div>
                    <p className="mb-1 text-sm text-muted-foreground">
                      {order.product?.name || t('product')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('quantity')}: {order.quantity}
                      {order.buyer != null && (
                        <> | {t('buyer')}: {order.buyer.display_name ?? '-'}</>
                      )}
                    </p>
                    <p className="mt-2 text-lg font-bold">
                      ¥{Number(order.total_amount).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Link href={`/orders/${order.id}`}>
                    <Button variant="outline" size="sm">
                      {t('viewDetails')}
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
