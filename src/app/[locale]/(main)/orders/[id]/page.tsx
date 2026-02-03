'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Link, useRouter } from '@/i18n/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ReportDialog } from '@/components/social/ReportDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Package, CheckCircle, XCircle, Clock, Flag, MessageSquare } from 'lucide-react'
import { showInfo } from '@/lib/utils/toast'
import { useOrderFeedback } from '@/lib/hooks/useSellerFeedback'
import { useTranslations } from 'next-intl'

export default function OrderPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = params.id as string
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = useTranslations('orders')
  const tSupport = useTranslations('support')
  const tCommon = useTranslations('common')
  const [cancelling, setCancelling] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // 检查是否已有反馈
  const { data: existingFeedback } = useOrderFeedback(orderId, user?.id)

  // If payment was successful (e.g. Stripe redirect), clean up the URL param & poll order status
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment')
    if (paymentSuccess === 'success') {
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
      
      // Short polling for 3 seconds (3 times every 1 second) to sync order status immediately
      let pollAttempt = 0
      const maxPolls = 3
      const pollInterval = 1000 // 1s
      const pollTimer = setInterval(() => {
        pollAttempt++
        queryClient.invalidateQueries({ queryKey: ['order', orderId] })
        if (pollAttempt >= maxPolls) {
          clearInterval(pollTimer)
        }
      }, pollInterval)
      
      return () => clearInterval(pollTimer)
    }
  }, [searchParams, queryClient, orderId])

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      // 检查用户是否登录
      if (!user) {
        throw new Error('请先登录')
      }

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          product:products(id, name, images, price),
          seller:profiles!orders_seller_id_fkey(id, username, display_name),
          buyer:profiles!orders_buyer_id_fkey(id, username, display_name)
        `)
        .eq('id', orderId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!orderId && !!user,
  })

  // Get order items if table exists
  const { data: orderItems } = useQuery({
    queryKey: ['orderItems', orderId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('order_items')
          .select(`
            *,
            product:products(id, name, images, price)
          `)
          .eq('order_id', orderId)

        if (error && !error.message.includes('does not exist')) throw error
        return data || []
      } catch {
        return []
      }
    },
    enabled: !!orderId,
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />
    }
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

  const handleCancelOrder = async () => {
    setCancelling(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('cancelOrderFailed'))
      }

      await queryClient.invalidateQueries({ queryKey: ['order', orderId] })
      await queryClient.invalidateQueries({ queryKey: ['orders', user?.id] })

      toast({
        variant: 'success',
        title: tCommon('success'),
        description: order?.payment_status === 'paid' ? t('orderCancelledWithRefund') : t('orderCancelledSuccess'),
      })
      router.refresh()
      setShowCancelDialog(false)
    } catch (error: any) {
      console.error('Cancel order error:', error)
      const isAbort = error?.name === 'AbortError'
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: isAbort ? (t('cancelOrderFailed') + '，' + tCommon('retry')) : `${t('cancelOrderFailed')}: ${error.message}`,
      })
    } finally {
      setCancelling(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('orderNotFoundOrFailed')}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/orders')}
        >
          {t('backToOrders')}
        </Button>
      </div>
    )
  }

  if (user && user.id !== order.buyer_id && user.id !== order.seller_id) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('noAccessToOrder')}</p>
      </div>
    )
  }

  const items = orderItems && orderItems.length > 0 
    ? orderItems 
    : [{
        product: order.product,
        quantity: order.quantity,
        price: order.unit_price,
      }]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
        <Button variant="outline" onClick={() => router.push('/orders')}>
          {t('backToOrders')}
        </Button>
      </div>

      {/* Order Info */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('orderNumber')}</p>
            <p className="font-semibold">{order.order_number}</p>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(order.order_status)}
            <span className="font-semibold">
              {getStatusText(order.order_status)}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">{t('paymentStatus')}</p>
            <p className="font-semibold">
              {order.payment_status === 'paid' ? t('paid') : t('pending')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('paymentMethod')}</p>
            {order.payment_method ? (
              <div>
                <p className="font-semibold capitalize">{order.payment_method}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('selectedAtCheckout')}</p>
              </div>
            ) : (
              <p className="font-semibold text-muted-foreground">{t('notSelected')}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('createdAt')}</p>
            <p className="font-semibold">
              {new Date(order.created_at).toLocaleString('zh-CN')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('seller')}</p>
            <Link
              href={`/profile/${order.seller_id}`}
              className="font-semibold hover:underline"
            >
              {order.seller?.display_name || order.seller?.username}
            </Link>
          </div>
        </div>
      </Card>

      {/* Order Items */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('orderItems')}</h2>
        <div className="space-y-4">
          {items.map((item: any, index: number) => (
            <div
              key={index}
              className="flex items-center justify-between border-b pb-4 last:border-0"
            >
              <div className="flex items-center gap-4">
                {item.product?.images?.[0] && (
                  <img
                    src={item.product.images[0]}
                    alt={item.product.name}
                    className="h-16 w-16 rounded object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold">{item.product?.name || t('product')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('quantity')}: {item.quantity} × ¥{item.price?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
              <p className="font-semibold">
                ¥{((item.price || 0) * item.quantity).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between text-lg font-bold">
            <span>{t('orderTotal')}</span>
            <span>¥{order.total_amount.toFixed(2)}</span>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <Card className="p-6">
        <div className="flex flex-wrap gap-3">
          {order.buyer_id === user?.id && 
           order.order_status !== 'cancelled' && 
           order.order_status !== 'completed' && (
            <>
              {order.payment_status === 'pending' && (
                <Button
                  className="flex-1"
                  onClick={() => router.push(`/orders/${orderId}/pay`)}
                >
                  {t('payNow')}
                </Button>
              )}
              {order.order_status !== 'shipped' && (
                <Button
                  variant="outline"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={cancelling}
                >
                  {t('cancelOrder')}
                </Button>
              )}
            </>
          )}
          {/* 评价卖家按钮 - 仅对已完成的订单显示 */}
          {order.buyer_id === user?.id && order.order_status === 'completed' && (
            <Button
              onClick={() => router.push(`/orders/${orderId}/feedback`)}
              className="flex-1"
            >
              {existingFeedback ? t('updateReview') : t('reviewSeller')}
            </Button>
          )}
          {user && (
            <Button
              variant="outline"
              onClick={() => {
                if (!user) {
                  showInfo('请先登录后再举报')
                  return
                }
                setShowReportDialog(true)
              }}
            >
              <Flag className="mr-2 h-4 w-4" />
              {t('reportOrder')}
            </Button>
          )}
          {user && (
            <Link href="/support/tickets/create">
              <Button variant="outline">
                <MessageSquare className="mr-2 h-4 w-4" />
                {tSupport('contactSupport')}
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {/* 举报对话框 */}
      <ReportDialog
        open={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        reportedType="order"
        reportedId={orderId}
      />

      {/* 取消订单确认 Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancelOrder')}</DialogTitle>
            <DialogDescription>{t('confirmCancelOrder')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={cancelling}
            >
              {cancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('loading')}
                </>
              ) : (
                tCommon('confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking */}
      {order.tracking_number && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('logisticsInfo')}</h2>
          <div className="space-y-2">
            <p>
              <span className="text-muted-foreground">{t('trackingNumber')}：</span>
              <span className="font-semibold">{order.tracking_number}</span>
            </p>
            {order.logistics_provider && (
              <p>
                <span className="text-muted-foreground">{t('logisticsProvider')}：</span>
                <span className="font-semibold">{order.logistics_provider}</span>
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => router.push(`/orders/${orderId}/tracking`)}
            >
              {t('viewTracking')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
