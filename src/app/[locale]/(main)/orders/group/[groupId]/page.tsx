'use client'

import { useParams as useNextParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Package, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export default function OrderGroupPage() {
  const params = useNextParams()
  const router = useRouter()
  const groupId = params.groupId as string
  const supabase = createClient()
  const t = useTranslations('orders')

  const { data: orderGroup, isLoading: isLoadingGroup } = useQuery({
    queryKey: ['orderGroup', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_groups')
        .select('*')
        .eq('id', groupId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!groupId,
  })

  const { data: childOrders, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['childOrders', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          seller:profiles!orders_seller_id_fkey(id, username, display_name),
          order_items(
            *,
            product:products(id, name, image)
          )
        `)
        .eq('parent_order_id', groupId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!groupId,
  })

  if (isLoadingGroup || isLoadingOrders) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!orderGroup) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">父订单不存在</p>
        <Button onClick={() => router.push('/orders')} className="mt-4">
          返回订单列表
        </Button>
      </div>
    )
  }

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'partial':
        return <Clock className="h-5 w-5 text-yellow-600" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return '已全部支付'
      case 'partial':
        return '部分支付'
      case 'failed':
        return '支付失败'
      default:
        return '待支付'
    }
  }

  const getSellerPaymentStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return '已支付'
      case 'failed':
        return '支付失败'
      default:
        return '待支付'
    }
  }

  const paidCount = childOrders?.filter(o => o.seller_payment_status === 'paid').length || 0
  const totalCount = childOrders?.length || 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">父订单详情</h1>
        <Button variant="outline" onClick={() => router.push('/orders')}>
          返回订单列表
        </Button>
      </div>

      {/* Parent Order Summary */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-3">
          {getPaymentStatusIcon(orderGroup.payment_status)}
          <h2 className="text-lg font-semibold">父订单信息</h2>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">父订单号</span>
            <span className="font-semibold">{orderGroup.order_group_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">总金额</span>
            <span className="text-xl font-bold">¥{orderGroup.total_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">支付状态</span>
            <span className={`font-semibold ${
              orderGroup.payment_status === 'paid' ? 'text-green-600' :
              orderGroup.payment_status === 'partial' ? 'text-yellow-600' :
              orderGroup.payment_status === 'failed' ? 'text-red-600' :
              'text-muted-foreground'
            }`}>
              {getPaymentStatusText(orderGroup.payment_status)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">订单状态</span>
            <span className="font-semibold">{t(orderGroup.order_status) || orderGroup.order_status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">子订单数量</span>
            <span className="font-semibold">{totalCount} 个（已支付 {paidCount} 个）</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">创建时间</span>
            <span className="font-semibold">
              {new Date(orderGroup.created_at).toLocaleString('zh-CN')}
            </span>
          </div>
        </div>
      </Card>

      {/* Child Orders List */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">子订单列表</h2>
        {!childOrders || childOrders.length === 0 ? (
          <p className="text-center text-muted-foreground">暂无子订单</p>
        ) : (
          <div className="space-y-4">
            {childOrders.map((order) => (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{order.order_number}</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        order.seller_payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                        order.seller_payment_status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {getSellerPaymentStatusText(order.seller_payment_status)}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">卖家</span>
                        <span className="font-medium">
                          {order.seller?.display_name || order.seller?.username || '未知卖家'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">订单金额</span>
                        <span className="font-semibold">¥{order.total_amount.toFixed(2)}</span>
                      </div>
                      {order.order_items && order.order_items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">商品：</p>
                          {order.order_items.map((item: any) => (
                            <div key={item.id} className="flex items-center gap-2 text-xs">
                              {item.product?.image && (
                                <img
                                  src={item.product.image}
                                  alt={item.product.name}
                                  className="h-8 w-8 rounded object-cover"
                                />
                              )}
                              <span>{item.product?.name || '未知商品'}</span>
                              <span className="text-muted-foreground">
                                × {item.quantity} × ¥{item.price.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex flex-col gap-2">
                    {order.seller_payment_status !== 'paid' && (
                      <Link href={`/orders/${order.id}/pay`}>
                        <Button size="sm" variant="outline">
                          支付
                        </Button>
                      </Link>
                    )}
                    <Link href={`/orders/${order.id}`}>
                      <Button size="sm" variant="ghost">
                        查看详情
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.push('/orders')} className="flex-1">
          返回订单列表
        </Button>
        {orderGroup.payment_status !== 'paid' && (
          <Button
            onClick={() => {
              // Navigate to first unpaid child order payment page
              const unpaidOrder = childOrders?.find(o => o.seller_payment_status !== 'paid')
              if (unpaidOrder) {
                router.push(`/orders/${unpaidOrder.id}/pay`)
              }
            }}
            className="flex-1"
            disabled={!childOrders?.some(o => o.seller_payment_status !== 'paid')}
          >
            继续支付
          </Button>
        )}
      </div>
    </div>
  )
}
