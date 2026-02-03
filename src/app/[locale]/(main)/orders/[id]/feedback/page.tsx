'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCreateSellerFeedback, useUpdateSellerFeedback, useOrderFeedback } from '@/lib/hooks/useSellerFeedback'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { showSuccess, showError, showInfo } from '@/lib/utils/toast'
import { sanitizeContent } from '@/lib/utils/sanitize-content'

export default function OrderFeedbackPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('orders')
  const tFeedback = useTranslations('orders.feedback')
  const tCommon = useTranslations('common')

  const [shippingTimeRating, setShippingTimeRating] = useState(0)
  const [productQualityRating, setProductQualityRating] = useState(0)
  const [customerServiceRating, setCustomerServiceRating] = useState(0)
  const [comment, setComment] = useState('')

  // 获取订单信息
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          seller:profiles!orders_seller_id_fkey(id, username, display_name)
        `)
        .eq('id', orderId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!orderId,
  })

  // 检查是否已有反馈
  const { data: existingFeedback, isLoading: feedbackLoading } = useOrderFeedback(
    orderId,
    user?.id
  )

  const createMutation = useCreateSellerFeedback()
  const updateMutation = useUpdateSellerFeedback()

  // 如果已有反馈，填充表单
  useEffect(() => {
    if (existingFeedback) {
      setShippingTimeRating(existingFeedback.shipping_time_rating || 0)
      setProductQualityRating(existingFeedback.product_quality_rating || 0)
      setCustomerServiceRating(existingFeedback.customer_service_rating || 0)
      setComment(existingFeedback.comment || '')
    }
  }, [existingFeedback])

  // 检查权限
  useEffect(() => {
    if (order && user && order.buyer_id !== user.id) {
      showInfo(tFeedback('onlyRateOwnOrder'))
      router.push(`/orders/${orderId}`)
    }
  }, [order, user, router, orderId, tFeedback])

  // 检查订单状态
  useEffect(() => {
    if (order && order.order_status !== 'completed') {
      showInfo(tFeedback('onlyCompletedOrder'))
      router.push(`/orders/${orderId}`)
    }
  }, [order, router, orderId, tFeedback])

  const MAX_COMMENT_LENGTH = 1000

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user || !order) return

    if (shippingTimeRating === 0 || productQualityRating === 0 || customerServiceRating === 0) {
      showError(tFeedback('ratingRequired'))
      return
    }

    const rawComment = comment.trim()
    if (rawComment.length > MAX_COMMENT_LENGTH) {
      showError(tFeedback('commentTooLong', { max: MAX_COMMENT_LENGTH }))
      return
    }
    const safeComment = rawComment ? sanitizeContent(rawComment) : undefined

    try {
      if (existingFeedback) {
        // 更新现有反馈
        await updateMutation.mutateAsync({
          feedbackId: existingFeedback.id,
          shippingTimeRating,
          productQualityRating,
          customerServiceRating,
          comment: safeComment,
        })
        showSuccess(tFeedback('feedbackUpdated'))
      } else {
        await createMutation.mutateAsync({
          orderId: order.id,
          buyerId: user.id,
          sellerId: order.seller_id,
          shippingTimeRating,
          productQualityRating,
          customerServiceRating,
          comment: safeComment,
        })
        showSuccess(tFeedback('feedbackSubmitted'))
      }

      router.push(`/orders/${orderId}`)
    } catch (error: any) {
      console.error('Submit feedback error:', error)
      showError(tFeedback('submitFailed'))
    }
  }

  const RatingStars = ({
    rating,
    setRating,
    label,
  }: {
    rating: number
    setRating: (rating: number) => void
    label: string
  }) => {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="focus:outline-none"
            >
              <Star
                className={`h-6 w-6 ${
                  star <= rating
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                } transition-colors`}
              />
            </button>
          ))}
          {rating > 0 && <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>}
        </div>
      </div>
    )
  }

  if (orderLoading || feedbackLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order || !user) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('orderNotFoundOrFailed')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {existingFeedback ? tFeedback('updatePageTitle') : tFeedback('pageTitle')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tFeedback('orderNumber')}: {order.order_number}
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <RatingStars
            rating={shippingTimeRating}
            setRating={setShippingTimeRating}
            label={tFeedback('shippingTime')}
          />

          <RatingStars
            rating={productQualityRating}
            setRating={setProductQualityRating}
            label={tFeedback('productQuality')}
          />

          <RatingStars
            rating={customerServiceRating}
            setRating={setCustomerServiceRating}
            label={tFeedback('customerService')}
          />

          <div className="space-y-2">
            <Label htmlFor="comment">{tFeedback('commentOptional')}</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={tFeedback('commentPlaceholder')}
              rows={4}
              maxLength={MAX_COMMENT_LENGTH}
            />
            <p className="text-right text-xs text-muted-foreground">{comment.length}/{MAX_COMMENT_LENGTH}</p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/orders/${orderId}`)}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('submitting')}
                </>
              ) : (
                existingFeedback ? tFeedback('updatePageTitle') : tFeedback('submitReview')
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
