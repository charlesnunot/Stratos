'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useProductReviews, useProductReviewStats } from '@/lib/hooks/useProductReviews'

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < rating
        return (
          <Star
            key={i}
            className={`h-4 w-4 ${filled ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
          />
        )
      })}
    </div>
  )
}

export function ProductReviewSection({ productId }: { productId: string }) {
  const t = useTranslations('products')
  const [ratingFilter, setRatingFilter] = useState<number | undefined>(undefined)
  const [sort, setSort] = useState<'new' | 'old'>('new')

  const { data: stats } = useProductReviewStats(productId)
  const { data: reviews = [], isLoading } = useProductReviews(productId, { rating: ratingFilter, sort })

  const dist = stats?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const total = stats?.total ?? 0
  const avg = stats?.average ?? null

  const filters = useMemo(() => [5, 4, 3, 2, 1], [])

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold">{t('reviewsTitle') || 'Reviews'}</h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={sort === 'new' ? 'default' : 'outline'}
            onClick={() => setSort('new')}
          >
            {t('latest') || 'Latest'}
          </Button>
          <Button
            size="sm"
            variant={sort === 'old' ? 'default' : 'outline'}
            onClick={() => setSort('old')}
          >
            {t('oldest') || 'Oldest'}
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="text-2xl font-bold">{avg ?? '—'}</div>
            <div className="text-sm text-muted-foreground">
              {total} {t('reviewCount') || 'reviews'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              className="cursor-pointer"
              variant={ratingFilter === undefined ? 'default' : 'outline'}
              onClick={() => setRatingFilter(undefined)}
            >
              {t('all') || 'All'}
            </Badge>
            {filters.map((r) => (
              <Badge
                key={r}
                className="cursor-pointer"
                variant={ratingFilter === r ? 'default' : 'outline'}
                onClick={() => setRatingFilter(r)}
              >
                {r} {t('stars') || 'stars'} ({dist[r] || 0})
              </Badge>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('reviewsOnlyPurchasedNote') || 'Only reviews from verified purchases are shown.'}
        </p>
      </Card>

      {isLoading ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('loading') || 'Loading…'}</p>
        </Card>
      ) : reviews.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('noReviews') || 'No reviews yet.'}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/profile/${r.user_id}`} className="text-sm font-medium">
                    {r.profiles?.display_name || r.profiles?.username || '用户'}
                  </Link>
                  <div className="mt-1">
                    <Stars rating={r.rating} />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>

              {r.content && <p className="text-sm whitespace-pre-wrap break-words">{r.content}</p>}

              {(r.image_urls?.length || 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {r.image_urls?.map((src, idx) => (
                    <img key={idx} src={src} alt="review" className="h-24 w-24 rounded object-cover" />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

