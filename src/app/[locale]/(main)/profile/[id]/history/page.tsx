'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useViewHistory, useClearViewHistory } from '@/lib/hooks/useViewHistory'
import { PostCard } from '@/components/social/PostCard'
import { ProductCard } from '@/components/ecommerce/ProductCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, ArrowLeft, History, Trash2 } from 'lucide-react'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { showSuccess, showError } from '@/lib/utils/toast'

export default function ProfileHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { user } = useAuth()
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  const { data: history, isLoading } = useViewHistory(100)
  const clearHistoryMutation = useClearViewHistory()
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    if (!user) return
    if (userId !== user.id) {
      router.replace(`/profile/${user.id}/history`)
      return
    }
  }, [user, userId, router])

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">{t('historyPleaseLogin')}</p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/login">{tCommon('retry')}</Link>
        </Button>
      </div>
    )
  }

  if (userId !== user.id) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const handleClearHistory = async () => {
    try {
      await clearHistoryMutation.mutateAsync()
      showSuccess(t('historyCleared'))
      setShowClearConfirm(false)
    } catch (error: any) {
      showError(error.message || tCommon('operationFailed'))
    }
  }

  const posts = history?.filter((item) => item.item_type === 'post' && item.post) || []
  const products = history?.filter((item) => item.item_type === 'product' && item.product) || []

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-2 sm:px-4 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/profile/${userId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <History className="h-6 w-6" />
            <h1 className="text-2xl font-bold">{t('historyPageTitle')}</h1>
          </div>
        </div>
        {history && history.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            disabled={clearHistoryMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('clearHistory')}
          </Button>
        )}
      </div>

      {showClearConfirm && (
        <Card className="p-4 border-warning">
          <div className="flex items-center justify-between">
            <p className="text-sm">{t('clearHistoryConfirm')}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearHistoryMutation.isPending}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearHistory}
                disabled={clearHistoryMutation.isPending}
              >
                {clearHistoryMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {tCommon('processing')}
                  </>
                ) : (
                  tCommon('confirm')
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !history || history.length === 0 ? (
        <Card className="p-12 text-center">
          <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-semibold mb-2">{t('noHistory')}</p>
          <p className="text-sm text-muted-foreground">{t('noHistoryHint')}</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {posts.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('historyPosts')} ({posts.length})</h2>
              <MasonryGrid>
                {posts.map((item) => {
                  if (!item.post) return null
                  // Convert ViewHistoryItem to Post format for PostCard
                  const post = {
                    id: item.post.id,
                    content: item.post.content,
                    image_urls: item.post.image_urls,
                    user_id: item.post.user_id,
                    like_count: item.post.like_count,
                    comment_count: item.post.comment_count,
                    created_at: item.post.created_at,
                    status: 'approved' as const,
                    post_type: 'normal' as const,
                  }
                  return <PostCard key={item.id} post={post} />
                })}
              </MasonryGrid>
            </div>
          )}

          {products.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('historyProducts')} ({products.length})</h2>
              <MasonryGrid>
                {products.map((item) => {
                  if (!item.product) return null
                  // Convert ViewHistoryItem to Product format for ProductCard
                  const product = {
                    id: item.product.id,
                    name: item.product.name,
                    images: item.product.images,
                    price: item.product.price,
                    seller_id: item.product.seller_id,
                    status: item.product.status,
                  }
                  return <ProductCard key={item.id} product={product} />
                })}
              </MasonryGrid>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
