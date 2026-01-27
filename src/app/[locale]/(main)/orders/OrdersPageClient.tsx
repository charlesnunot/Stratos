'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package } from 'lucide-react'
import { Link } from '@/i18n/navigation'

interface Order {
  id: string
  order_number: string
  order_status: string
  payment_status: string
  total_amount: number
  quantity: number
  product?: {
    id: string
    name: string
    images: string[]
  }
  seller?: {
    display_name: string
  }
  buyer_id: string
}

interface OrdersPageClientProps {
  initialOrders: Order[]
  initialError: any
  user: { id: string }
  translations: {
    myOrders: string
    noOrders: string
    goShopping: string
    orderNumber: string
    pending: string
    paid: string
    shipped: string
    completed: string
    cancelled: string
    product: string
    quantity: string
    seller: string
    viewDetails: string
    payNow: string
  }
}

export function OrdersPageClient({ 
  initialOrders, 
  initialError, 
  user,
  translations 
}: OrdersPageClientProps) {
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
      pending: translations.pending,
      paid: translations.paid,
      shipped: translations.shipped,
      completed: translations.completed,
      cancelled: translations.cancelled,
    }
    return statusMap[status] || status
  }

  const orders = initialOrders

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{translations.myOrders}</h1>
      {!orders || orders.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{translations.noOrders}</p>
          <Button className="mt-4" onClick={() => window.location.href = '/'}>
            {translations.goShopping}
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
                        {translations.orderNumber}: {order.order_number}
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
                      {order.product?.name || translations.product}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {translations.quantity}: {order.quantity} | {translations.seller}: {order.seller?.display_name}
                    </p>
                    <p className="mt-2 text-lg font-bold">
                      ¥{order.total_amount.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Link href={`/orders/${order.id}`}>
                    <Button variant="outline" size="sm">
                      {translations.viewDetails}
                    </Button>
                  </Link>
                  {order.payment_status === 'pending' &&
                    order.buyer_id === user.id && (
                      <Link href={`/orders/${order.id}/pay`}>
                        <Button size="sm">{translations.payNow}</Button>
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
