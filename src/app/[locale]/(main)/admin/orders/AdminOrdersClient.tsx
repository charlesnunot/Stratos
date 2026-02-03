'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { Eye } from 'lucide-react'
import { Link } from '@/i18n/navigation'

interface Order {
  id: string
  order_number: string
  buyer_id: string
  seller_id: string
  total_amount: number
  currency: string
  payment_status: string
  order_status: string
  created_at: string
  buyer?: { username: string; display_name: string }
  seller?: { username: string; display_name: string }
  disputes?: Array<{
    id: string
    dispute_type: string
    status: string
    reason: string
  }>
}

interface Dispute {
  id: string
  order_id: string
  dispute_type: string
  status: string
  reason: string
  created_at: string
  orders: {
    order_number: string
    total_amount: number
    currency: string
    buyer?: { username: string; display_name: string }
    seller?: { username: string; display_name: string }
  }
}

interface AdminOrdersClientProps {
  initialOrders: Order[]
  initialDisputes: Dispute[]
}

export function AdminOrdersClient({ initialOrders, initialDisputes }: AdminOrdersClientProps) {
  const t = useTranslations('admin')
  const params = useParams()
  const locale = (params as any)?.locale as string | undefined
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [disputes, setDisputes] = useState<Dispute[]>(initialDisputes)
  const [activeTab, setActiveTab] = useState('orders')

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      paid: 'default',
      pending: 'secondary',
      failed: 'destructive',
      refunded: 'outline',
    }
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{t('ordersTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('ordersSubtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="orders">{t('ordersTab')} ({orders.length})</TabsTrigger>
          <TabsTrigger value="disputes">
            {t('disputesTab')} ({disputes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('allOrders')}</CardTitle>
              <CardDescription>{t('allOrdersDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {orders.map((order) => (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{order.order_number}</span>
                            {getStatusBadge(order.payment_status)}
                            {getStatusBadge(order.order_status)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>
                              {t('buyer')}: {order.buyer?.display_name || order.buyer?.username || 'Unknown'}
                            </p>
                            <p>
                              {t('sellerLabel')}: {order.seller?.display_name || order.seller?.username || 'Unknown'}
                            </p>
                            <p>
                              {t('orderAmount')}: {formatCurrency(order.total_amount, (order.currency as Currency) || 'USD')}
                            </p>
                            <p>{t('createdAtLabel')}: {new Date(order.created_at).toLocaleString()}</p>
                          </div>
                          {order.disputes && order.disputes.length > 0 && (
                            <div className="mt-2">
                              <Badge variant="destructive">
                                {t('disputesCount', { count: order.disputes.length })}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/orders/${order.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              {t('viewDetail')}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('pendingDisputesTitle')}</CardTitle>
              <CardDescription>{t('pendingDisputesDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {disputes.map((dispute) => (
                  <Card key={dispute.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {t('orderLabel')}: {dispute.orders.order_number}
                            </span>
                            <Badge variant="destructive">{dispute.status}</Badge>
                            <Badge variant="outline">{dispute.dispute_type}</Badge>
                          </div>
                          <p className="text-sm">{dispute.reason}</p>
                          <div className="text-sm text-muted-foreground">
                            <p>
                              {t('orderAmount')}: {formatCurrency(dispute.orders.total_amount, (dispute.orders.currency as Currency) || 'USD')}
                            </p>
                            <p>{t('createdAtLabel')}: {new Date(dispute.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/admin/disputes/${dispute.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              {t('resolveDispute')}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {disputes.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">{t('noPendingDisputes')}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
