'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Share2, MoreHorizontal, Flag, ExternalLink, Link2, X, Repeat2 } from 'lucide-react'
import { ProductLikeButton } from '../ProductLikeButton'
import { ProductWantButton } from '../ProductWantButton'
import { ProductFavoriteButton } from '../ProductFavoriteButton'
import { ReportDialog } from '@/components/social/ReportDialog'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { createImageErrorHandler } from '@/lib/utils/image-retry'
import type { ListProductDTO, ProductCardState, ProductCardCapabilities } from '@/lib/product-card/types'
import type { ProductActions } from '@/lib/product-card/useProductCardActions'

export interface ProductCardViewProps {
  dto: ListProductDTO
  state: ProductCardState
  capabilities: ProductCardCapabilities
  actions: ProductActions
}

export function ProductCardView({ dto, state, capabilities, actions }: ProductCardViewProps) {
  const t = useTranslations('products')
  const tCommon = useTranslations('common')
  const tMessages = useTranslations('messages')
  const locale = useLocale()
  const router = useRouter()

  const [imageError, setImageError] = useState(false)
  const [imageRetryCount, setImageRetryCount] = useState(0)

  const handleImageError = createImageErrorHandler({
    maxRetries: 3,
    retryDelay: 1000,
    fallbackSrc: '/placeholder-product.png',
  })

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

  // Check if product has color or size options
  const hasOptions = Boolean(
    dto.content.colorOptions?.length || dto.content.sizes?.length
  )

  // Handle add to cart: redirect to detail page if product has options
  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (hasOptions) {
      // Redirect to product detail page to select options (use Link href format)
      router.push(`/product/${dto.id}` as any)
      return
    }
    
    // Otherwise, add to cart directly
    actions.addToCart(e)
  }

  const productPath = actions.getProductUrl()
  const productUrl = typeof window !== 'undefined' ? window.location.origin + productPath : productPath
  const displayName = getDisplayContent(
    locale,
    dto.content.contentLang,
    dto.content.name,
    dto.content.nameTranslated
  )
  const displayDescription = getDisplayContent(
    locale,
    dto.content.contentLang,
    dto.content.description,
    dto.content.descriptionTranslated
  )
  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
  const priceDisplay = useMemo(
    () => formatPriceWithConversion(dto.price, dto.currency as Currency, userCurrency),
    [dto.price, dto.currency, userCurrency]
  )

  useEffect(() => {
    if (!isMenuOpen || !menuRef.current) {
      setMenuPosition(null)
      return
    }
    const updatePosition = () => {
      if (!menuRef.current) return
      const rect = menuRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const estimatedMenuHeight = 280
      const menuWidth = 180
      let top = rect.bottom + 8
      let left = rect.right - menuWidth
      if (top + estimatedMenuHeight > viewportHeight) {
        top = rect.top - estimatedMenuHeight
        if (top < 8) top = Math.max(8, viewportHeight - estimatedMenuHeight - 8)
      }
      if (left < 8) left = 8
      setMenuPosition({ top, left })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isMenuOpen])

  const handleReport = () => {
    setIsMenuOpen(false)
    if (actions.requestReportDialog()) setShowReportDialog(true)
  }

  const handleCardClick = () => {
    actions.openProduct()
  }

  return (
    <>
      <RepostDialog
        open={showRepostDialog}
        onClose={() => setShowRepostDialog(false)}
        onConfirm={actions.repostToUsers}
        isLoading={actions.repostPending}
      />
      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        url={productUrl}
        title={displayName || 'View this product'}
        description={displayDescription || undefined}
        image={dto.content.images?.[0]}
        itemType="product"
        itemId={dto.id}
      />
      <Card
        className="group overflow-hidden transition-shadow hover:shadow-lg w-full min-w-0 cursor-pointer h-full flex flex-col"
        onClick={handleCardClick}
      >
        <Link href={productPath}>
          <div className="relative aspect-square w-full overflow-hidden">
            {dto.content.images.length > 0 && !imageError ? (
              <img
                key={`${dto.content.images[0]}-${imageRetryCount}`}
                src={dto.content.images[0]}
                alt={displayName}
                className="object-cover transition-transform group-hover:scale-105 w-full h-full"
                onError={handleImageError}
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <span className="text-muted-foreground">{tCommon('noImage')}</span>
              </div>
            )}
          </div>
        </Link>

        <div className="p-3 md:p-4 min-w-0 flex flex-col flex-1">
          <Link href={productPath}>
            <h3 className="mb-2 font-semibold line-clamp-2 break-words">{displayName}</h3>
          </Link>
          {displayDescription && (
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground break-words">
              {displayDescription}
            </p>
          )}

          <div className="flex items-center justify-center mb-3">
            <div className="flex items-center gap-1 sm:gap-2 md:gap-4 justify-center">
              <div onClick={(e) => e.stopPropagation()}>
                <ProductLikeButton productId={dto.id} initialLikes={dto.stats.likeCount} />
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <ProductWantButton productId={dto.id} initialWants={dto.stats.wantCount} />
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <ProductFavoriteButton productId={dto.id} initialFavorites={dto.stats.favoriteCount} />
              </div>
              {capabilities.canRepost && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 sm:gap-2 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMenuOpen(false)
                    setShowRepostDialog(true)
                  }}
                  disabled={actions.repostPending}
                >
                  <Repeat2 className="h-4 w-4 shrink-0" />
                  <span className="text-xs sm:text-sm">{dto.stats.repostCount}</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 sm:gap-2 shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowShareDialog(true)
                }}
              >
                <Share2 className="h-4 w-4 shrink-0" />
                <span className="text-xs sm:text-sm">{dto.stats.shareCount}</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-stretch justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{priceDisplay.main}</p>
              {dto.stats.salesCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('salesCount', { count: dto.stats.salesCount })}
                </p>
              )}
              {dto.content.shippingFee !== undefined && dto.content.shippingFee > 0 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('shippingFee')}: {formatPriceWithConversion(dto.content.shippingFee, dto.currency as Currency, userCurrency).main}
                </p>
              ) : dto.content.shippingFee === 0 ? (
                <p className="text-xs text-green-600 mt-1">{t('freeShipping') || '免运费'}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddToCart}
                disabled={
                  actions.adding ||
                  state.interaction.isInCart ||
                  !capabilities.canAddToCart
                }
                variant={state.interaction.isInCart ? 'secondary' : 'default'}
                className="flex-1"
              >
                <ShoppingCart className="mr-1 h-4 w-4" />
                <span>
                  {actions.adding ? t('addedToCart') : state.interaction.isInCart ? t('alreadyInCart') : t('addToCart')}
                </span>
              </Button>
              <Button
                size="sm"
                onClick={(e) => actions.buyNow(e)}
                disabled={
                  actions.buying ||
                  !capabilities.canBuy
                }
                variant="outline"
                className="flex-1"
              >
                <span>
                  {actions.buying ? t('redirectingCheckout') : t('buyNow')}
                </span>
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Link
              href={`/profile/${dto.seller.id}`}
              className="flex items-center gap-2 min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {dto.seller.avatarUrl ? (
                  <img
                    src={dto.seller.avatarUrl}
                    alt={dto.seller.displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs">
                    {dto.seller.displayName?.[0] || dto.seller.username?.[0]}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold truncate">
                {dto.seller.displayName || dto.seller.username}
              </p>
            </Link>
            <div className="flex items-center gap-2">
              {capabilities.canMessageSeller && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    actions.messageSeller()
                  }}
                >
                  {tMessages('chatWithSeller')}
                </Button>
              )}
              <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMenuOpen(!isMenuOpen)
                  }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>

                {isMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[90]"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    {menuPosition && (
                      <Card
                        className="fixed z-[100] min-w-[180px] p-2 shadow-lg"
                        style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="space-y-1">
                          {capabilities.canReport && (
                            <button
                              onClick={handleReport}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                            >
                              <Flag className="mr-2 h-4 w-4" />
                              <span>{t('report')}</span>
                            </button>
                          )}
                          <button
                            onClick={() => { setIsMenuOpen(false); actions.openProduct(); }}
                            className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            <span>{t('openProduct')}</span>
                          </button>
                          <button
                            onClick={() => { setIsMenuOpen(false); actions.copyLink(); }}
                            className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                          >
                            <Link2 className="mr-2 h-4 w-4" />
                            <span>{t('copyLink')}</span>
                          </button>
                          <button
                            onClick={() => setIsMenuOpen(false)}
                            className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent border-t mt-1 pt-2"
                          >
                            <X className="mr-2 h-4 w-4" />
                            <span>{tCommon('cancel')}</span>
                          </button>
                        </div>
                      </Card>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <ReportDialog
          open={showReportDialog}
          onClose={() => setShowReportDialog(false)}
          reportedType="product"
          reportedId={dto.id}
        />
      </Card>
    </>
  )
}
