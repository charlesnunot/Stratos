'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { trackLogistics } from '@/lib/logistics/tracking'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Package, MapPin, Clock } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function OrderTrackingPage() {
  const params = useParams()
  const orderId = params.id as string
  const supabase = createClient()
  const t = useTranslations('orders')
  const tCommon = useTranslations('common')

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!orderId,
  })

  const { data: tracking, isLoading: trackingLoading } = useQuery({
    queryKey: ['tracking', order?.tracking_number, order?.logistics_provider],
    queryFn: async () => {
      if (!order?.tracking_number || !order?.logistics_provider) return null
      return await trackLogistics(order.tracking_number, order.logistics_provider)
    },
    enabled: !!order?.tracking_number && !!order?.logistics_provider,
  })

  if (orderLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{tCommon('error')}</p>
        <Link href="/orders">
          <Button variant="outline" className="mt-4">
            {tCommon('back')}
          </Button>
        </Link>
      </div>
    )
  }

  if (!order.tracking_number) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-8 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-bold">{t('noTrackingInfo')}</h2>
          <p className="mb-6 text-muted-foreground">
            {tCommon('loading')}
          </p>
          <Link href={`/orders/${orderId}`}>
            <Button variant="outline">{tCommon('back')}</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('tracking')}</h1>
        <Link href={`/orders/${orderId}`}>
          <Button variant="outline">{tCommon('back')}</Button>
        </Link>
      </div>

      <Card className="p-6">
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">物流单号：</span>
            <span className="font-semibold">{order.tracking_number}</span>
          </div>
          {order.logistics_provider && (
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{tCommon('company')}: </span>
              <span className="font-semibold">{order.logistics_provider}</span>
            </div>
          )}
        </div>
      </Card>

      {trackingLoading ? (
        <Card className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </Card>
      ) : tracking ? (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">物流状态</h2>
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">当前状态：</span>
              <span className="font-semibold">{tracking.status}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">当前位置：</span>
              <span className="font-semibold">{tracking.current_location}</span>
            </div>
            {tracking.estimated_delivery && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">预计送达：</span>
                <span className="font-semibold">
                  {new Date(tracking.estimated_delivery).toLocaleString('zh-CN')}
                </span>
              </div>
            )}
          </div>

          {tracking.tracking_details && tracking.tracking_details.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-4 text-sm font-semibold">物流详情</h3>
              <div className="space-y-4">
                {tracking.tracking_details.map((detail: any, index: number) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-primary" />
                      {index < tracking.tracking_details.length - 1 && (
                        <div className="h-12 w-0.5 bg-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-semibold">{detail.status}</p>
                      <p className="text-sm text-muted-foreground">
                        {detail.location}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(detail.time).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6">
          <p className="text-center text-muted-foreground">
            无法获取物流信息，请稍后重试
          </p>
        </Card>
      )}
    </div>
  )
}
