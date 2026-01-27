'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
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
        <h1 className="text-3xl font-bold">订单监管</h1>
        <p className="mt-2 text-muted-foreground">查看和管理所有订单及纠纷</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="orders">订单 ({orders.length})</TabsTrigger>
          <TabsTrigger value="disputes">
            待处理纠纷 ({disputes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>所有订单</CardTitle>
              <CardDescription>查看平台所有订单状态</CardDescription>
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
                              买家: {order.buyer?.display_name || order.buyer?.username || 'Unknown'}
                            </p>
                            <p>
                              卖家: {order.seller?.display_name || order.seller?.username || 'Unknown'}
                            </p>
                            <p>
                              金额: {formatCurrency(order.total_amount, (order.currency as Currency) || 'USD')}
                            </p>
                            <p>创建时间: {new Date(order.created_at).toLocaleString('zh-CN')}</p>
                          </div>
                          {order.disputes && order.disputes.length > 0 && (
                            <div className="mt-2">
                              <Badge variant="destructive">
                                {order.disputes.length} 个纠纷
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/orders/${order.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              查看详情
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
              <CardTitle>待处理纠纷</CardTitle>
              <CardDescription>需要管理员处理的订单纠纷</CardDescription>
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
                              订单: {dispute.orders.order_number}
                            </span>
                            <Badge variant="destructive">{dispute.status}</Badge>
                            <Badge variant="outline">{dispute.dispute_type}</Badge>
                          </div>
                          <p className="text-sm">{dispute.reason}</p>
                          <div className="text-sm text-muted-foreground">
                            <p>
                              金额: {formatCurrency(dispute.orders.total_amount, (dispute.orders.currency as Currency) || 'USD')}
                            </p>
                            <p>创建时间: {new Date(dispute.created_at).toLocaleString('zh-CN')}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/admin/disputes/${dispute.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-2" />
                              处理纠纷
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {disputes.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">暂无待处理纠纷</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
