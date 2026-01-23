'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Package } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function OrdersPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('orders')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          product:products(id, name, images),
          seller:profiles!orders_seller_id_fkey(display_name)
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  if (!user) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t('pleaseLoginToView')}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
          <Button className="mt-4" onClick={() => window.location.href = '/'}>
            {t('goShopping')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order: any) => (
            <Card key={order.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  {order.product?.images?.[0] && (
                    <img
                      src={order.product.images[0]}
                      alt={order.product.name}
                      className="h-20 w-20 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
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
                    <p className="text-sm text-muted-foreground mb-1">
                      {order.product?.name || t('product')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('quantity')}: {order.quantity} | {t('seller')}: {order.seller?.display_name}
                    </p>
                    <p className="mt-2 text-lg font-bold">
                      ¥{order.total_amount.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Link href={`/orders/${order.id}`}>
                    <Button variant="outline" size="sm">
                      {t('viewDetails')}
                    </Button>
                  </Link>
                  {order.payment_status === 'pending' &&
                    order.buyer_id === user.id && (
                      <Link href={`/orders/${order.id}/pay`}>
                        <Button size="sm">{t('payNow')}</Button>
                      </Link>
                    )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
