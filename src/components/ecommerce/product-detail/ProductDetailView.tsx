'use client'

import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Flag, Star, Repeat2, Share2 } from 'lucide-react'
import { ReportDialog } from '@/components/social/ReportDialog'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { ProductLikeButton } from '@/components/ecommerce/ProductLikeButton'
import { ProductWantButton } from '@/components/ecommerce/ProductWantButton'
import { ProductFavoriteButton } from '@/components/ecommerce/ProductFavoriteButton'
import { SellerFeedback } from '@/components/ecommerce/SellerFeedback'
import { ProductDetailsTabs } from '@/components/ecommerce/ProductDetailsTabs'
import { ProductReviewForm } from '@/components/ecommerce/ProductReviewForm'
import { ProductReviewSection } from '@/components/ecommerce/ProductReviewSection'
import { ProductCommentSection } from '@/components/ecommerce/ProductCommentSection'
import type { ListProductDTO, ProductCardState, ProductCardCapabilities } from '@/lib/product-card/types'
import type { ProductDetailActions } from '@/lib/product-card/useProductDetailActions'

export interface ProductDetailViewProps {
  dto: ListProductDTO
  state: ProductCardState
  capabilities: ProductCardCapabilities
  actions: ProductDetailActions
  displayName: string
  displayDescription: string
  translations: {
    description: string
    stock: string
    seller: string
    report: string
    addedToCart: string
    addToCart: string
    buyNow: string
    buyNowLoading?: string
    noImage: string
    removeFromFavorites: string
    addToFavorites: string
    chatWithSeller: string
    loading?: string
    /** 分享弹窗标题无商品名时的 fallback */
    openProduct?: string
  }
  priceDisplay: { main: string; approx?: string }
  salesCountText?: string
  /** 按 locale 展示的分类（AI 生成，非硬编码） */
  displayCategory?: string | null
  details: string | null | undefined
  faq: Array<{ question: string; answer: string }> | null
  showReportDialog: boolean
  setShowReportDialog: (v: boolean) => void
  showRepostDialog: boolean
  setShowRepostDialog: (v: boolean) => void
  showShareDialog: boolean
  setShowShareDialog: (v: boolean) => void
  onRepostConfirm: (targetUserIds: string[], content?: string) => void
  repostPending: boolean
  isFavorite: boolean
  onToggleFavorite: () => void
  favoritePending: boolean
  authLoading?: boolean
  /** 可选：替换默认「咨询卖家」按钮，用于接入 ChatButton（与帖子详情页一致） */
  chatSellerButton?: React.ReactNode
  /** Phase 2 信任判断块：判断 + 证据 + 可反对，渲染在卖家行与咨询卖家按钮之上 */
  trustJudgmentBlock?: React.ReactNode
}

/**
 * 详情页纯 UI 壳：仅消费 dto/state/capabilities/actions 与展示用 props，禁止 world-side hooks。
 */
export function ProductDetailView({
  dto,
  state,
  capabilities,
  actions,
  displayName,
  displayDescription,
  translations,
  priceDisplay,
  salesCountText,
  displayCategory,
  details,
  faq,
  showReportDialog,
  setShowReportDialog,
  showRepostDialog,
  setShowRepostDialog,
  showShareDialog,
  setShowShareDialog,
  onRepostConfirm,
  repostPending,
  isFavorite,
  onToggleFavorite,
  favoritePending,
  authLoading = false,
  chatSellerButton,
  trustJudgmentBlock,
}: ProductDetailViewProps) {
  const handleReport = () => {
    if (actions.requestReportDialog()) setShowReportDialog(true)
  }

  const images = dto.content.images ?? []

  return (
    <div className="mx-auto max-w-6xl w-full overflow-x-hidden">
      <div className="grid gap-4 md:gap-8 md:grid-cols-2">
        <div className="space-y-4 w-full overflow-x-hidden">
          {images.length > 0 ? (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                <img
                  src={images[0]}
                  alt={displayName}
                  className="h-full w-full object-cover max-w-full"
                />
              </div>
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2 w-full">
                  {images.slice(1, 5).map((image: string, index: number) => (
                    <div
                      key={index}
                      className="relative aspect-square overflow-hidden rounded-lg"
                    >
                      <img
                        src={image}
                        alt={`${displayName} ${index + 2}`}
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

        <div className="space-y-4 md:space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {displayCategory && (
                <span className="inline-block mb-2 px-2 py-0.5 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                  {displayCategory}
                </span>
              )}
              <h1 className="mb-2 text-2xl md:text-3xl font-bold break-words">{displayName}</h1>
              <p className="text-2xl md:text-3xl font-bold text-primary">{priceDisplay.main}</p>
              {salesCountText && (
                <p className="text-sm text-muted-foreground mt-1">{salesCountText}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {capabilities.canFavorite && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleFavorite}
                  disabled={favoritePending}
                  title={isFavorite ? translations.removeFromFavorites : translations.addToFavorites}
                >
                  <Star className={`h-5 w-5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                </Button>
              )}
              {capabilities.canReport && (
                <Button variant="ghost" size="icon" onClick={handleReport} title={translations.report}>
                  <Flag className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>

          {(displayName || displayDescription) && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">{translations.description}</h2>
              <p className="text-muted-foreground break-words whitespace-pre-wrap">
                {displayDescription || displayName}
              </p>
            </div>
          )}

          {trustJudgmentBlock && (
            <div className="mb-2">{trustJudgmentBlock}</div>
          )}
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              {translations.stock}: {dto.stock}
            </p>
            <div className="flex items-center gap-3">
              <Link
                href={`/profile/${dto.seller.id}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                {translations.seller}: {dto.seller.displayName}
              </Link>
              {authLoading ? (
                <Button variant="outline" size="sm" disabled>
                  {translations.loading ?? '...'}
                </Button>
              ) : capabilities.canMessageSeller ? (
                chatSellerButton ?? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actions.messageSellerLoading}
                    onClick={() => actions.messageSeller()}
                  >
                    {actions.messageSellerLoading ? (translations.loading ?? '...') : translations.chatWithSeller}
                  </Button>
                )
              ) : null}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Button
              size="lg"
              className="flex-1"
              onClick={() => actions.addToCart()}
              disabled={actions.adding || !capabilities.canAddToCart || state.interaction.isInCart}
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              {actions.adding ? translations.addedToCart : state.interaction.isInCart ? translations.addedToCart : translations.addToCart}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => actions.buyNow()}
              disabled={actions.buying || !capabilities.canBuy}
            >
              {actions.buying ? (translations.buyNowLoading ?? translations.loading ?? '...') : translations.buyNow}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
            <ProductLikeButton productId={dto.id} initialLikes={dto.stats.likeCount} />
            <ProductWantButton productId={dto.id} initialWants={dto.stats.wantCount} />
            <ProductFavoriteButton productId={dto.id} initialFavorites={dto.stats.favoriteCount} />
            {capabilities.canRepost && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setShowRepostDialog(true)}
                disabled={repostPending}
              >
                <Repeat2 className="h-4 w-4" />
                <span className="text-sm">{dto.stats.repostCount}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setShowShareDialog(true)}
            >
              <Share2 className="h-4 w-4" />
              <span className="text-sm">{dto.stats.shareCount}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <SellerFeedback sellerId={dto.seller.id} />
      </div>

      <ProductDetailsTabs
        productId={dto.id}
        productDetails={details}
        productFaq={faq}
        sellerId={dto.seller.id}
      />

      <ProductReviewForm productId={dto.id} />
      <ProductReviewSection productId={dto.id} />
      <ProductCommentSection productId={dto.id} />

      <ReportDialog
        open={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        reportedType="product"
        reportedId={dto.id}
      />

      <RepostDialog
        open={showRepostDialog}
        onClose={() => setShowRepostDialog(false)}
        onConfirm={onRepostConfirm}
        isLoading={repostPending}
      />

      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        url={actions.getProductUrl()}
        title={displayName || translations.openProduct || 'View this product'}
        description={displayDescription || undefined}
        image={images[0]}
        itemType="product"
        itemId={dto.id}
      />
    </div>
  )
}
