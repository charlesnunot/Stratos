'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Loader2, Flag, Star, Repeat2, Share2, Heart, ShoppingBag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cartStore'
import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ReportDialog } from '@/components/social/ReportDialog'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { ProductLikeButton } from '@/components/ecommerce/ProductLikeButton'
import { ProductWantButton } from '@/components/ecommerce/ProductWantButton'
import { ProductFavoriteButton } from '@/components/ecommerce/ProductFavoriteButton'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIsFavorite, useToggleFavorite } from '@/lib/hooks/useFavorites'
import { useRepost } from '@/lib/hooks/useRepost'
import { showInfo, showSuccess, showError } from '@/lib/utils/toast'
import { Card } from '@/components/ui/card'
import { ChatButton } from '@/components/social/ChatButton'
import { SellerFeedback } from '@/components/ecommerce/SellerFeedback'
import { ProductDetailsTabs } from '@/components/ecommerce/ProductDetailsTabs'
import { ProductReviewForm } from '@/components/ecommerce/ProductReviewForm'
import { ProductReviewSection } from '@/components/ecommerce/ProductReviewSection'
import { ProductCommentSection } from '@/components/ecommerce/ProductCommentSection'

export default function ProductPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.id as string
  const addItem = useCartStore((state) => state.addItem)
  const [adding, setAdding] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('products')
  const tCommon = useTranslations('common')
  const tPosts = useTranslations('posts')
  const tMessages = useTranslations('messages')

  // 检查是否已收藏
  const { data: isFavorite } = useIsFavorite('product', productId)
  const toggleFavoriteMutation = useToggleFavorite()
  
  // 转发相关
  const repostMutation = useRepost()

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          seller:profiles!products_seller_id_fkey(username, display_name)
        `)
        .eq('id', productId)
        .eq('status', 'active')
        .single()
      
      // 解析 FAQ JSONB 字段
      if (data && data.faq) {
        try {
          data.faq = typeof data.faq === 'string' ? JSON.parse(data.faq) : data.faq
        } catch (e) {
          data.faq = []
        }
      }
      
      // 确保返回的product包含所有计数字段
      if (data) {
        return {
          ...data,
          like_count: data.like_count || 0,
          want_count: data.want_count || 0,
          share_count: data.share_count || 0,
          repost_count: data.repost_count || 0,
          favorite_count: data.favorite_count || 0,
        }
      }

      if (error) throw error
      return data
    },
    enabled: !!productId,
  })

  const handleAddToCart = () => {
    if (!product) return
    setAdding(true)
    addItem({
      product_id: product.id,
      quantity: 1,
      price: product.price,
      name: product.name,
      image: product.images?.[0] || '',
    })
    setTimeout(() => setAdding(false), 500)
  }

  const handleBuyNow = () => {
    if (!product) return
    addItem({
      product_id: product.id,
      quantity: 1,
      price: product.price,
      name: product.name,
      image: product.images?.[0] || '',
    })
    router.push('/checkout')
  }

  const handleReport = () => {
    if (!user) {
      showInfo('请先登录后再举报')
      return
    }
    setShowReportDialog(true)
  }

  // 处理收藏商品
  const handleAddToFavorites = async () => {
    if (!user) {
      showInfo('请先登录后再收藏')
      return
    }
    
    try {
      toggleFavoriteMutation.mutate({
        itemType: 'product',
        itemId: productId,
        isFavorite: isFavorite || false,
      }, {
        onSuccess: () => {
          if (isFavorite) {
            showSuccess(tPosts('removeFromFavorites'))
          } else {
            showSuccess(tPosts('addToFavorites'))
          }
        },
        onError: (error: any) => {
          console.error('Toggle favorite error:', error)
          showError('操作失败，请重试')
        },
      })
    } catch (error) {
      console.error('Toggle favorite error:', error)
      showError('操作失败，请重试')
    }
  }

  const handleRepost = () => {
    if (!user) {
      showInfo('请先登录后再转发')
      return
    }
    setShowRepostDialog(true)
  }

  const handleRepostConfirm = (targetUserIds: string[], content?: string) => {
    repostMutation.mutate(
      {
        itemType: 'product',
        itemId: productId,
        targetUserIds: targetUserIds,
        content: content,
      },
      {
        onSuccess: (result) => {
          setShowRepostDialog(false)
          if (result.count > 0 && result.alreadyExists > 0) {
            showSuccess(`已转发给 ${result.count} 个用户（${result.alreadyExists} 个用户已接收过）`)
          } else if (result.count > 0) {
            showSuccess(`已转发给 ${result.count} 个用户`)
          } else if (result.alreadyExists > 0) {
            showInfo(`这些用户已经接收过此转发`)
          } else {
            showError('转发失败，请重试')
          }
        },
        onError: (error: any) => {
          console.error('Repost error:', error)
          showError('转发失败，请重试')
        },
      }
    )
  }

  const handleShare = () => {
    setShowShareDialog(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('loadFailed')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl w-full overflow-x-hidden">
      <div className="grid gap-4 md:gap-8 md:grid-cols-2">
        {/* Product Images */}
        <div className="space-y-4 w-full overflow-x-hidden">
          {product.images && product.images.length > 0 ? (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="h-full w-full object-cover max-w-full"
                />
              </div>
              {product.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2 w-full">
                  {product.images.slice(1, 5).map((image: string, index: number) => (
                    <div
                      key={index}
                      className="relative aspect-square overflow-hidden rounded-lg"
                    >
                      <img
                        src={image}
                        alt={`${product.name} ${index + 2}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
              <span className="text-muted-foreground">{tCommon('noImage')}</span>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="mb-2 text-2xl md:text-3xl font-bold break-words">{product.name}</h1>
              <p className="text-2xl md:text-3xl font-bold text-primary">
                ¥{product.price.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleAddToFavorites}
                  disabled={toggleFavoriteMutation.isPending}
                  title={isFavorite ? tPosts('removeFromFavorites') : tPosts('addToFavorites')}
                >
                  <Star className={`h-5 w-5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleReport}
                title={t('report')}
              >
                <Flag className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {product.description && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">{t('description')}</h2>
              <p className="text-muted-foreground break-words whitespace-pre-wrap">{product.description}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              {t('stock')}: {product.stock}
            </p>
            {product.seller && (
              <div className="flex items-center gap-3">
                <Link
                  href={`/profile/${product.seller_id}`}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  {t('seller')}: {product.seller.display_name}
                </Link>
                {user && user.id !== product.seller_id && (
                  <ChatButton
                    targetUserId={product.seller_id}
                    variant="outline"
                    size="sm"
                    shareCard={{
                      type: 'product',
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      image: product.images?.[0],
                      url: `/product/${product.id}`,
                    }}
                  >
                    {tMessages('chatWithSeller')}
                  </ChatButton>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Button
              size="lg"
              className="flex-1"
              onClick={handleAddToCart}
              disabled={adding || product.stock <= 0}
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              {adding ? t('addedToCart') : t('addToCart')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={handleBuyNow}
              disabled={product.stock <= 0}
            >
              {t('buyNow')}
            </Button>
          </div>

          {/* 互动按钮 */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
            <ProductLikeButton productId={product.id} initialLikes={product.like_count || 0} />
            <ProductWantButton productId={product.id} initialWants={product.want_count || 0} />
            <ProductFavoriteButton productId={product.id} initialFavorites={product.favorite_count || 0} />
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={handleRepost}
                disabled={repostMutation.isPending}
              >
                <Repeat2 className="h-4 w-4" />
                <span className="text-sm">{product.repost_count || 0}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4" />
              <span className="text-sm">{product.share_count || 0}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 卖家反馈 */}
      {product.seller_id && (
        <div className="mt-8">
          <SellerFeedback sellerId={product.seller_id} />
        </div>
      )}

      {/* 商品详情和 FAQ 标签页 */}
      <ProductDetailsTabs
        productId={product.id}
        productDetails={product.details}
        productFaq={product.faq as Array<{ question: string; answer: string }> | null}
        sellerId={product.seller_id}
      />

      {/* 商品评价（购买后） */}
      <ProductReviewForm productId={product.id} />
      <ProductReviewSection productId={product.id} />

      {/* 商品讨论（所有用户） */}
      <ProductCommentSection productId={product.id} />

      {/* 举报对话框 */}
      <ReportDialog
        open={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        reportedType="product"
        reportedId={productId}
      />

      {/* 转发对话框 */}
      <RepostDialog
        open={showRepostDialog}
        onClose={() => setShowRepostDialog(false)}
        onConfirm={handleRepostConfirm}
        isLoading={repostMutation.isPending}
      />

      {/* 分享对话框 */}
      {product && (
        <ShareDialog
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          url={`${typeof window !== 'undefined' ? window.location.origin : ''}/product/${productId}`}
          title={product.name || '查看这个商品'}
          description={product.description || undefined}
          image={product.images?.[0]}
          itemType="product"
          itemId={productId}
        />
      )}
    </div>
  )
}
