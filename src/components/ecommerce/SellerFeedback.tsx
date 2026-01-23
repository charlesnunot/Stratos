'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface SellerFeedbackProps {
  sellerId: string
}

interface FeedbackStats {
  total_ratings: number
  avg_shipping_time_rating: number | null
  avg_product_quality_rating: number | null
  avg_customer_service_rating: number | null
  total_orders_with_feedback: number
}

interface OrderStats {
  total_orders: number
}

// 获取评分表情符号和文字
function getRatingEmoji(rating: number | null): { emoji: string; text: string } {
  if (!rating) {
    return { emoji: '😐', text: '暂无评价' }
  }
  if (rating >= 4.5) {
    return { emoji: '😍', text: 'Excellent' }
  } else if (rating >= 3.5) {
    return { emoji: '😊', text: 'Good' }
  } else if (rating >= 2.5) {
    return { emoji: '😕', text: 'Not bad' }
  } else {
    return { emoji: '😞', text: 'Poor' }
  }
}

export function SellerFeedback({ sellerId }: SellerFeedbackProps) {
  const supabase = createClient()
  const t = useTranslations('products')

  // 获取卖家反馈统计
  const { data: feedbackStats, isLoading: feedbackLoading } = useQuery<FeedbackStats>({
    queryKey: ['sellerFeedbackStats', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_feedback_stats')
        .select('*')
        .eq('seller_id', sellerId)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 是 "not found" 错误，这是正常的（如果卖家还没有反馈）
        throw error
      }

      return data || {
        total_ratings: 0,
        avg_shipping_time_rating: null,
        avg_product_quality_rating: null,
        avg_customer_service_rating: null,
        total_orders_with_feedback: 0,
      }
    },
    enabled: !!sellerId,
  })

  // 获取卖家历史订单数
  const { data: orderStats, isLoading: orderLoading } = useQuery<OrderStats>({
    queryKey: ['sellerOrderStats', sellerId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .in('order_status', ['paid', 'shipped', 'completed'])

      if (error) throw error

      return { total_orders: count || 0 }
    },
    enabled: !!sellerId,
  })

  if (feedbackLoading || orderLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  const stats = feedbackStats || {
    total_ratings: 0,
    avg_shipping_time_rating: null,
    avg_product_quality_rating: null,
    avg_customer_service_rating: null,
    total_orders_with_feedback: 0,
  }

  const orders = orderStats?.total_orders || 0

  // 如果没有反馈，不显示组件
  if (stats.total_ratings === 0 && orders === 0) {
    return null
  }

  const shippingEmoji = getRatingEmoji(stats.avg_shipping_time_rating)
  const qualityEmoji = getRatingEmoji(stats.avg_product_quality_rating)
  const serviceEmoji = getRatingEmoji(stats.avg_customer_service_rating)

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">
          {t('sellerFeedback') || 'Customer feedback for this store'}
        </h3>
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold">{orders}</span>{' '}
          {t('pastOrders') || 'past orders'} ·{' '}
          <span className="font-semibold">{stats.total_ratings}</span>{' '}
          {t('customerRatings') || 'customer ratings'}
        </div>
      </div>

      {stats.total_ratings > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{t('shippingTime') || 'Shipping Time'}</h4>
            <div className="flex items-center gap-2">
              <span className="text-lg">{shippingEmoji.emoji}</span>
              <span className="text-sm text-muted-foreground">{shippingEmoji.text}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{t('productQuality') || 'Product Quality'}</h4>
            <div className="flex items-center gap-2">
              <span className="text-lg">{qualityEmoji.emoji}</span>
              <span className="text-sm text-muted-foreground">{qualityEmoji.text}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{t('customerService') || 'Customer Service'}</h4>
            <div className="flex items-center gap-2">
              <span className="text-lg">{serviceEmoji.emoji}</span>
              <span className="text-sm text-muted-foreground">{serviceEmoji.text}</span>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('feedbackNote') || 'These are ratings provided by customers who have purchased from this store in the past. Ratings may not relate to this exact product.'}
      </p>
    </Card>
  )
}
