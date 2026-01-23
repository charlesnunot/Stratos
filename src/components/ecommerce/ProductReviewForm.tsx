'use client'

import { useMemo, useState } from 'react'
import { Star, Loader2, Image as ImageIcon, X } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/hooks/useAuth'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { showError, showInfo, showSuccess } from '@/lib/utils/toast'
import { handleError } from '@/lib/utils/handleError'
import { useCanReviewProduct, useCreateProductReview } from '@/lib/hooks/useProductReviews'
import { useTranslations } from 'next-intl'

function StarPicker({
  rating,
  setRating,
}: {
  rating: number
  setRating: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const value = i + 1
        const filled = value <= rating
        return (
          <button key={value} type="button" onClick={() => setRating(value)} className="p-1">
            <Star className={`h-5 w-5 ${filled ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
          </button>
        )
      })}
    </div>
  )
}

export function ProductReviewForm({ productId }: { productId: string }) {
  const t = useTranslations('products')
  const { user } = useAuth()
  const [rating, setRating] = useState(0)
  const [content, setContent] = useState('')

  const createMutation = useCreateProductReview()
  const { data: canReview, isLoading: canReviewLoading } = useCanReviewProduct(productId, user?.id)

  const imageUpload = useImageUpload({
    bucket: 'post-images',
    folder: 'product-reviews',
    maxImages: 5,
    onUploadComplete: () => {},
  })

  const disabledReason = useMemo(() => {
    if (!user) return t('loginToReview') || 'Please login to review'
    if (canReviewLoading) return t('checkingEligibility') || 'Checking eligibility…'
    if (!canReview?.canReview) {
      if (canReview?.reason === 'already_reviewed') return t('alreadyReviewed') || 'You already reviewed this order'
      if (canReview?.reason === 'no_eligible_order') return t('noEligibleOrder') || 'Only shipped/completed orders can be reviewed'
      return t('cannotReview') || 'Cannot review right now'
    }
    return null
  }, [user, canReview, canReviewLoading, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      showInfo('请先登录后再评价')
      return
    }
    if (!canReview?.canReview || !canReview.orderId) {
      showError('当前账号没有可评价的订单')
      return
    }
    if (rating === 0) {
      showError('请先选择星级评分')
      return
    }

    try {
      const imageUrls = await imageUpload.uploadImages()
      await createMutation.mutateAsync({
        productId,
        orderId: canReview.orderId,
        userId: user.id,
        rating,
        content: content.trim() || undefined,
        imageUrls,
      })
      setRating(0)
      setContent('')
      imageUpload.clearImages()
      showSuccess('评价已提交')
    } catch (err: any) {
      handleError(err, '提交失败，请重试')
    }
  }

  if (!user) {
    return (
      <Card className="p-4 mt-8">
        <p className="text-sm text-muted-foreground">
          {t('loginToReviewHint') || 'Login to review purchased products.'}
        </p>
      </Card>
    )
  }

  if (canReviewLoading) {
    return (
      <Card className="p-4 mt-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('checkingEligibility') || 'Checking eligibility…'}
        </div>
      </Card>
    )
  }

  if (!canReview?.canReview) {
    return (
      <Card className="p-4 mt-8">
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      </Card>
    )
  }

  return (
    <Card className="p-4 mt-8 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('writeReviewTitle') || 'Write a review'}</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('ratingLabel') || 'Rating'}</p>
          <StarPicker rating={rating} setRating={setRating} />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">{t('reviewContentOptional') || 'Review (optional)'}</p>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('reviewPlaceholder') || 'Share your experience…'}
            rows={4}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('product-review-images')?.click()}
            disabled={imageUpload.totalImageCount >= 5 || createMutation.isPending}
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            {t('uploadImages') || 'Upload images'}
          </Button>
          <input
            id="product-review-images"
            type="file"
            accept="image/*"
            multiple
            onChange={imageUpload.handleImageSelect}
            className="hidden"
            disabled={imageUpload.totalImageCount >= 5 || createMutation.isPending}
          />

          <Button type="submit" size="sm" disabled={createMutation.isPending || rating === 0}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('submitReview') || 'Submit'}
          </Button>
        </div>

        {imageUpload.totalImageCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {imageUpload.imagePreviews.map((src, idx) => (
              <div key={idx} className="relative">
                <img src={src} alt="preview" className="h-16 w-16 rounded object-cover" />
                <button
                  type="button"
                  className="absolute -top-2 -right-2 rounded-full bg-background border p-1"
                  onClick={() => imageUpload.removeImage(idx)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </form>
    </Card>
  )
}

