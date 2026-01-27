'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Flag, Star, Repeat2, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cartStore'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ReportDialog } from '@/components/social/ReportDialog'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { ProductLikeButton } from '@/components/ecommerce/ProductLikeButton'
import { ProductWantButton } from '@/components/ecommerce/ProductWantButton'
import { ProductFavoriteButton } from '@/components/ecommerce/ProductFavoriteButton'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIsFavorite, useToggleFavorite } from '@/lib/hooks/useFavorites'
import { useRepost } from '@/lib/hooks/useRepost'
import { useRecordView } from '@/lib/hooks/useViewHistory'
import { showInfo, showSuccess, showError, showWarning } from '@/lib/utils/toast'
import { ChatButton } from '@/components/social/ChatButton'
import { SellerFeedback } from '@/components/ecommerce/SellerFeedback'
import { ProductDetailsTabs } from '@/components/ecommerce/ProductDetailsTabs'
import { ProductReviewForm } from '@/components/ecommerce/ProductReviewForm'
import { ProductReviewSection } from '@/components/ecommerce/ProductReviewSection'
import { ProductCommentSection } from '@/components/ecommerce/ProductCommentSection'
import { initializeAffiliateAttribution } from '@/lib/utils/affiliate-attribution'

interface ProductPageClientProps {
  product: any
  user: { id: string } | null
  translations: {
    loadFailed: string
    description: string
    stock: string
    seller: string
    report: string
    addedToCart: string
    addToCart: string
    buyNow: string
    noImage: string
    removeFromFavorites: string
    addToFavorites: string
    chatWithSeller: string
  }
}

export function ProductPageClient({ product, user: initialUser, translations }: ProductPageClientProps) {
  const router = useRouter()
  const productId = product.id
  const addItem = useCartStore((state) => state.addItem)
  const [adding, setAdding] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()

  // 检查是否已收藏
  const { data: isFavorite } = useIsFavorite('product', productId)
  const toggleFavoriteMutation = useToggleFavorite()
  
  // 转发相关
  const repostMutation = useRepost()
  
  // 记录浏览历史
  const recordViewMutation = useRecordView()

  // Initialize affiliate attribution on page load
  useEffect(() => {
    initializeAffiliateAttribution()
  }, [])

  // 记录浏览历史
  useEffect(() => {
    if (user && product && product.status === 'active') {
      recordViewMutation.mutate({
        itemType: 'product',
        itemId: productId,
      })
    }
  }, [user, product, productId, recordViewMutation])

  const handleAddToCart = async () => {
    // 验证商品状态
    if (product.status && product.status !== 'active') {
      showError(`商品已下架，无法加入购物车`)
      return
    }

    // 验证库存（即使UI已禁用，函数内也要验证）
    if (product.stock !== null && product.stock !== undefined && product.stock <= 0) {
      showError('商品库存不足，无法加入购物车')
      return
    }

    // 实时验证商品信息（包括价格）
    setAdding(true)
    try {
      const { data: currentProduct, error } = await supabase
        .from('products')
        .select('id, status, stock, price')
        .eq('id', product.id)
        .single()

      if (error || !currentProduct) {
        showError('商品不存在或已被删除')
        setAdding(false)
        return
      }

      if (currentProduct.status !== 'active') {
        showError('商品已下架，无法加入购物车')
        setAdding(false)
        return
      }

      if (currentProduct.stock !== null && currentProduct.stock !== undefined && currentProduct.stock <= 0) {
        showError('商品库存不足，无法加入购物车')
        setAdding(false)
        return
      }

      // 验证价格是否变化（允许0.01的误差）
      const priceDiff = Math.abs(currentProduct.price - product.price)
      if (priceDiff > 0.01) {
        showWarning(`商品价格已更新为 ¥${currentProduct.price.toFixed(2)}，请刷新页面后重试`)
        setAdding(false)
        return
      }

      addItem({
        product_id: product.id,
        quantity: 1,
        price: currentProduct.price, // 使用最新价格
        name: product.name,
        image: product.images?.[0] || '',
      })
      setTimeout(() => setAdding(false), 500)
    } catch (error) {
      console.error('Error validating product before adding to cart:', error)
      showError('验证商品信息失败，请重试')
      setAdding(false)
    }
  }

  const handleBuyNow = async () => {
    // 验证商品状态
    if (product.status && product.status !== 'active') {
      showError(`商品已下架，无法购买`)
      return
    }

    // 验证库存
    if (product.stock !== null && product.stock !== undefined && product.stock <= 0) {
      showError('商品库存不足，无法购买')
      return
    }

    // 实时验证商品信息（包括价格）
    try {
      const { data: currentProduct, error } = await supabase
        .from('products')
        .select('id, status, stock, price')
        .eq('id', product.id)
        .single()

      if (error || !currentProduct) {
        showError('商品不存在或已被删除')
        return
      }

      if (currentProduct.status !== 'active') {
        showError('商品已下架，无法购买')
        return
      }

      if (currentProduct.stock !== null && currentProduct.stock !== undefined && currentProduct.stock <= 0) {
        showError('商品库存不足，无法购买')
        return
      }

      // 验证价格是否变化（允许0.01的误差）
      const priceDiff = Math.abs(currentProduct.price - product.price)
      if (priceDiff > 0.01) {
        showWarning(`商品价格已更新为 ¥${currentProduct.price.toFixed(2)}，请刷新页面后重试`)
        return
      }

      addItem({
        product_id: product.id,
        quantity: 1,
        price: currentProduct.price, // 使用最新价格
        name: product.name,
        image: product.images?.[0] || '',
      })
      router.push('/checkout')
    } catch (error) {
      console.error('Error validating product before buying:', error)
      showError('验证商品信息失败，请重试')
    }
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
            showSuccess(translations.removeFromFavorites)
          } else {
            showSuccess(translations.addToFavorites)
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
              <span className="text-muted-foreground">{translations.noImage}</span>
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
                  title={isFavorite ? translations.removeFromFavorites : translations.addToFavorites}
                >
                  <Star className={`h-5 w-5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleReport}
                title={translations.report}
              >
                <Flag className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {product.description && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">{translations.description}</h2>
              <p className="text-muted-foreground break-words whitespace-pre-wrap">{product.description}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              {translations.stock}: {product.stock}
            </p>
            {product.seller && (
              <div className="flex items-center gap-3">
                <Link
                  href={`/profile/${product.seller_id}`}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  {translations.seller}: {product.seller.display_name}
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
                    {translations.chatWithSeller}
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
              {adding ? translations.addedToCart : translations.addToCart}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={handleBuyNow}
              disabled={product.stock <= 0}
            >
              {translations.buyNow}
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
