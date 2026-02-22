'use client'

import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Flag, Star, Repeat2, Share2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/store/cartStore'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import { useTranslations, useLocale } from 'next-intl'
import { ChatButton } from '@/components/social/ChatButton'
import { SellerFeedback } from '@/components/ecommerce/SellerFeedback'
import { ProductDetailsTabs } from '@/components/ecommerce/ProductDetailsTabs'
import { ProductReviewForm } from '@/components/ecommerce/ProductReviewForm'
import { ProductReviewSection } from '@/components/ecommerce/ProductReviewSection'
import { ProductCommentSection } from '@/components/ecommerce/ProductCommentSection'
import { initializeAffiliateAttribution } from '@/lib/utils/affiliate-attribution'
import { getCountryDisplayName, SALES_COUNTRIES } from '@/lib/constants/sales-countries'
import { getDisplayContent, type ContentLang } from '@/lib/ai/display-translated'
import { getLocalizedColorName } from '@/lib/constants/colors'
import type { Product } from '@/lib/types/api'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { useSwipe } from '@/lib/hooks/useSwipe'
import { useImagePreload } from '@/lib/hooks/useImagePreload'
import { ImageLightbox } from '@/components/ecommerce/ImageLightbox'
import { createImageErrorHandler } from '@/lib/utils/image-retry'

interface ProductPageClientProps {
  product: Product
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
    selectSize: string
    viewProduct: string
    colorOptions: string
    noImageColor: string
    salesCountries: string
    salesCountriesTo: string
    salesCountriesGlobal: string
    productInactive: string
    productOutOfStock: string
    pleaseSelectColor: string
    pleaseSelectSize: string
    productNotFound: string
    validationFailed: string
    priceUpdated: string
    addedToCartSuccess: string
    validationError: string
    cannotBuyInactive: string
    cannotBuyOutOfStock: string
    cannotBuyOwnProduct: string
    loginToReport: string
    loginToFavorite: string
    loginToRepost: string
    operationFailed: string
    repostSuccess: string
    repostSuccessWithExists: string
    repostAlreadyExists: string
    repostFailed: string
    toastInfo: string
    toastSuccess: string
    toastError: string
    toastWarning: string
  }
}

export function ProductPageClient({ product, user: initialUser, translations }: ProductPageClientProps) {
  const router = useRouter()
  const productId = product.id
  const addItem = useCartStore((state) => state.addItem)
  
  // 图片加载错误处理（重试3次后显示占位图）
  const handleImageError = createImageErrorHandler({
    maxRetries: 3,
    retryDelay: 1000,
    fallbackSrc: '/placeholder-product.png',
  })
  
  const [adding, setAdding] = useState(false)
  const [buying, setBuying] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedColorImage, setSelectedColorImage] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showLightbox, setShowLightbox] = useState(false)
  const [showSwipeHint, setShowSwipeHint] = useState(true)
  const [hasUserSwiped, setHasUserSwiped] = useState(false)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [isDescriptionOverflowing, setIsDescriptionOverflowing] = useState(false)
  const descriptionRef = useRef<HTMLParagraphElement>(null)
  const { user } = useAuth()

  // 缓存 onIndexChange 回调，避免每次渲染创建新函数
  const handleLightboxIndexChange = useCallback((index: number) => {
    if (!selectedColorImage) {
      setCurrentImageIndex(index)
    }
  }, [selectedColorImage])

  // 智能图片预加载
  const { isPreloading, preloadedImages } = useImagePreload(
    product.images || [],
    currentImageIndex,
    {
      preloadDistance: 2, // 预加载当前图片前后2张
      enabled: true
    }
  )

  // 控制滑动提示自动消失
  useEffect(() => {
    if (showSwipeHint) {
      const timer = setTimeout(() => {
        setShowSwipeHint(false)
      }, 3000) // 3秒后自动消失
      return () => clearTimeout(timer)
    }
  }, [showSwipeHint])



  const supabase = createClient()
  const t = useTranslations('seller')
  const locale = useLocale()

  // 触摸滑动处理
  const { swipeHandlers } = useSwipe({
    onSwipeLeft: () => {
      // 向左滑：下一张
      if (product.images.length > 1 && !selectedColorImage) {
        setCurrentImageIndex((prev) => (prev + 1) % product.images.length)
        setShowSwipeHint(false)
        if (!hasUserSwiped) {
          setHasUserSwiped(true)
          // 记录到 localStorage，下次访问不再显示
          localStorage.setItem('product_swipe_hint_shown', 'true')
        }
      }
    },
    onSwipeRight: () => {
      // 向右滑：上一张
      if (product.images.length > 1 && !selectedColorImage) {
        setCurrentImageIndex((prev) => 
          prev === 0 ? product.images.length - 1 : prev - 1
        )
        setShowSwipeHint(false)
        if (!hasUserSwiped) {
          setHasUserSwiped(true)
          // 记录到 localStorage，下次访问不再显示
          localStorage.setItem('product_swipe_hint_shown', 'true')
        }
      }
    },
    threshold: 50
  })

  // 翻译辅助函数
  const getLocalizedContent = (
    content: string | null | undefined,
    contentTranslated: string | null | undefined
  ): string => {
    return getDisplayContent(
      locale,
      (product.content_lang === 'zh' || product.content_lang === 'en' ? product.content_lang : null) as ContentLang,
      content,
      contentTranslated
    )
  }

  // 计算各字段的显示值
  const displayName = getLocalizedContent(product.name, product.name_translated)
  const displayDescription = getLocalizedContent(product.description, product.description_translated)
  const displayDetails = getLocalizedContent(product.details, product.details_translated)

  // 检查描述是否超过2行
  useEffect(() => {
    if (descriptionRef.current && displayDescription) {
      const element = descriptionRef.current
      const lineHeight = parseInt(window.getComputedStyle(element).lineHeight) || 24
      const maxHeight = lineHeight * 2
      setIsDescriptionOverflowing(element.scrollHeight > maxHeight)
    }
  }, [displayDescription])

  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])

  const priceDisplay = useMemo(
    () => formatPriceWithConversion(product.price, product.currency as Currency, userCurrency),
    [product.price, product.currency, userCurrency]
  )

  const shippingFeeDisplay = useMemo(
    () => formatPriceWithConversion(product.shipping_fee || 0, product.currency as Currency, userCurrency),
    [product.shipping_fee, product.currency, userCurrency]
  )

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
    // 防止重复点击
    if (adding) return

    // 检查是否是商品作者
    if (user?.id === product.seller_id) {
      showInfo(translations.cannotBuyOwnProduct, translations.toastInfo)
      return
    }

    // 验证商品状态
    if (product.status && product.status !== 'active') {
      showError(translations.productInactive, translations.toastError)
      return
    }

    // 验证库存
    if (product.stock !== null && product.stock !== undefined && product.stock <= 0) {
      showError(translations.productOutOfStock, translations.toastError)
      return
    }

    // 验证颜色/尺寸选择（如果商品有这些选项）
    if (product.color_options && product.color_options.length > 0 && !selectedColor) {
      showError(translations.pleaseSelectColor, translations.toastError)
      return
    }
    if (product.sizes && product.sizes.length > 0 && !selectedSize) {
      showError(translations.pleaseSelectSize, translations.toastError)
      return
    }

    // 实时验证商品信息（调用API，使用SERVICE_ROLE_KEY权限）
    setAdding(true)
    try {
      const res = await fetch('/api/checkout/validate-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ productId: product.id }),
      })
      const data = await res.json()

      if (!res.ok || !data?.ok) {
        const reason = data?.reason ?? 'server_error'
        if (reason === 'not_found') showError(translations.productNotFound, translations.toastError)
        else if (reason === 'inactive') showError(translations.productInactive, translations.toastError)
        else if (reason === 'out_of_stock') showError(translations.productOutOfStock, translations.toastError)
        else showError(data?.message || translations.validationFailed, translations.toastError)
        setAdding(false)
        return
      }

      const currentProduct = data.product

      // 验证价格是否变化（根据货币允许误差）
      const priceDiff = Math.abs(currentProduct.price - product.price)
      const productCurrency = product.currency?.toUpperCase() || 'CNY'
      const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(productCurrency)
      const precision = isZeroDecimalCurrency ? 0 : 0.01
      
      if (priceDiff > precision) {
        const formattedPrice = formatPriceWithConversion(currentProduct.price, product.currency as Currency, userCurrency)
        showWarning(translations.priceUpdated.replace('{price}', formattedPrice.main), translations.toastWarning)
        setAdding(false)
        return
      }

      // 验证库存是否足够
      if (product.stock !== null && product.stock !== undefined && quantity > product.stock) {
        showError(`库存不足，最多只能购买 ${product.stock} 件`, translations.toastError)
        setAdding(false)
        return
      }

      addItem({
        product_id: product.id,
        quantity: quantity,
        price: currentProduct.price,
        currency: currentProduct.currency,
        name: displayName,
        image: selectedColorImage || product.images?.[0] || '',
        color: selectedColor ?? undefined,
        size: selectedSize ?? undefined,
      })
      showSuccess(translations.addedToCartSuccess, translations.toastSuccess)
      setTimeout(() => setAdding(false), 500)
    } catch (error) {
      console.error('Error validating product before adding to cart:', error)
      showError(translations.validationError, translations.toastError)
      setAdding(false)
    }
  }

  const handleBuyNow = async () => {
    // 防止重复点击
    if (buying) return

    // 检查是否是商品作者
    if (user?.id === product.seller_id) {
      showInfo(translations.cannotBuyOwnProduct, translations.toastInfo)
      return
    }

    // 验证商品状态
    if (product.status && product.status !== 'active') {
      showError(translations.cannotBuyInactive, translations.toastError)
      return
    }

    // 验证库存
    if (product.stock !== null && product.stock !== undefined && product.stock <= 0) {
      showError(translations.cannotBuyOutOfStock, translations.toastError)
      return
    }

    // 验证颜色/尺寸选择（如果商品有这些选项）
    if (product.color_options && product.color_options.length > 0 && !selectedColor) {
      showError(translations.pleaseSelectColor, translations.toastError)
      return
    }
    if (product.sizes && product.sizes.length > 0 && !selectedSize) {
      showError(translations.pleaseSelectSize, translations.toastError)
      return
    }

    // 实时验证商品信息（调用API，使用SERVICE_ROLE_KEY权限）
    setBuying(true)
    try {
      const res = await fetch('/api/checkout/validate-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ productId: product.id }),
      })
      const data = await res.json()

      if (!res.ok || !data?.ok) {
        const reason = data?.reason ?? 'server_error'
        if (reason === 'not_found') showError(translations.productNotFound, translations.toastError)
        else if (reason === 'inactive') showError(translations.cannotBuyInactive, translations.toastError)
        else if (reason === 'out_of_stock') showError(translations.cannotBuyOutOfStock, translations.toastError)
        else showError(data?.message || translations.validationFailed, translations.toastError)
        setBuying(false)
        return
      }

      const currentProduct = data.product

      // 验证价格是否变化（根据货币允许误差）
      const priceDiff = Math.abs(currentProduct.price - product.price)
      const productCurrency = product.currency?.toUpperCase() || 'CNY'
      const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(productCurrency)
      const precision = isZeroDecimalCurrency ? 0 : 0.01
      
      if (priceDiff > precision) {
        const formattedPrice = formatPriceWithConversion(currentProduct.price, product.currency as Currency, userCurrency)
        showWarning(translations.priceUpdated.replace('{price}', formattedPrice.main), translations.toastWarning)
        setBuying(false)
        return
      }

      // 验证库存是否足够
      if (product.stock !== null && product.stock !== undefined && quantity > product.stock) {
        showError(`库存不足，最多只能购买 ${product.stock} 件`, translations.toastError)
        setBuying(false)
        return
      }

      addItem({
        product_id: product.id,
        quantity: quantity,
        price: currentProduct.price,
        currency: currentProduct.currency,
        name: displayName,
        image: selectedColorImage || product.images?.[0] || '',
        color: selectedColor ?? undefined,
        size: selectedSize ?? undefined,
      })
      router.push('/checkout')
    } catch (error) {
      console.error('Error validating product before buying:', error)
      showError(translations.validationError, translations.toastError)
      setBuying(false)
    }
  }

  const handleReport = () => {
    if (!user) {
      showInfo(translations.loginToReport, translations.toastInfo)
      return
    }
    setShowReportDialog(true)
  }

  // 处理收藏商品
  const handleAddToFavorites = async () => {
    if (!user) {
      showInfo(translations.loginToFavorite, translations.toastInfo)
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
            showSuccess(translations.removeFromFavorites, translations.toastSuccess)
          } else {
            showSuccess(translations.addToFavorites, translations.toastSuccess)
          }
        },
        onError: (error: any) => {
          console.error('Toggle favorite error:', error)
          showError(translations.operationFailed, translations.toastError)
        },
      })
    } catch (error) {
      console.error('Toggle favorite error:', error)
      showError(translations.operationFailed, translations.toastError)
    }
  }

  const handleRepost = () => {
    if (!user) {
      showInfo(translations.loginToRepost, translations.toastInfo)
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
            showSuccess(translations.repostSuccessWithExists.replace('{count}', String(result.count)).replace('{alreadyExists}', String(result.alreadyExists)), translations.toastSuccess)
          } else if (result.count > 0) {
            showSuccess(translations.repostSuccess.replace('{count}', String(result.count)), translations.toastSuccess)
          } else if (result.alreadyExists > 0) {
            showInfo(translations.repostAlreadyExists, translations.toastInfo)
          } else {
            showError(translations.repostFailed, translations.toastError)
          }
        },
        onError: (error: any) => {
          console.error('Repost error:', error)
          showError(translations.repostFailed, translations.toastError)
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
          {selectedColorImage ? (
            <div
              className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted"
            >
              <img
                src={selectedColorImage}
                alt=""
                className="h-full w-full object-cover"
                onError={handleImageError}
              />
            </div>
          ) : product.images && product.images.length > 0 ? (
            <>
              <div
                className="relative aspect-square w-full overflow-hidden rounded-lg touch-pan-y bg-muted"
                {...swipeHandlers}
              >
                <img
                  src={product.images[currentImageIndex]}
                  alt=""
                  className="h-full w-full object-cover cursor-zoom-in"
                  onClick={() => {
                    setShowLightbox(true)
                  }}
                  onError={handleImageError}
                />
                
                {/* 滑动提示（可选） */}
                {product.images.length > 1 && !selectedColorImage && (
                  <>
                    {/* 左侧滑动提示 */}
                    <div 
                      className={`
                        absolute left-2 top-1/2 -translate-y-1/2 
                        bg-black/50 text-white p-3 rounded-full 
                        transition-all duration-500 md:hidden
                        ${showSwipeHint ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
                      `}
                    >
                      <span className="text-lg">←</span>
                    </div>
                    {/* 右侧滑动提示 */}
                    <div 
                      className={`
                        absolute right-2 top-1/2 -translate-y-1/2 
                        bg-black/50 text-white p-3 rounded-full 
                        transition-all duration-500 md:hidden
                        ${showSwipeHint ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
                      `}
                    >
                      <span className="text-lg">→</span>
                    </div>
                    
                    {/* 提示文字 */}
                    {showSwipeHint && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full md:hidden animate-pulse">
                        左右滑动切换图片
                      </div>
                    )}
                  </>
                )}
              </div>
              {product.images.length > 1 && !selectedColorImage && (
                <div className="grid grid-cols-4 gap-2 w-full">
                  {product.images.map((image: string, index: number) => (
                    <div
                      key={index}
                      role="button"
                      aria-label={`查看图片 ${index + 1}`}
                      tabIndex={0}
                      onClick={() => setCurrentImageIndex(index)}
                      onKeyDown={(e) => e.key === 'Enter' && setCurrentImageIndex(index)}
                      className={`
                        relative aspect-square overflow-hidden rounded-lg cursor-pointer
                        border-2 transition-all duration-200
                        ${currentImageIndex === index
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-transparent hover:border-gray-300'
                        }
                      `}
                    >
                      <img
                        src={image}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={handleImageError}
                      />
                      {currentImageIndex === index && (
                        <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
                      )}
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
              <h1 className="mb-2 text-2xl md:text-3xl font-bold break-words line-clamp-2">{displayName}</h1>
              <p className="text-2xl md:text-3xl font-bold text-primary">
                {priceDisplay.main}
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

          {displayDescription && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">{translations.description}</h2>
              <div className="relative">
                <p
                  ref={descriptionRef}
                  className={`text-muted-foreground break-words transition-all duration-300 ${
                    isDescriptionExpanded ? '' : 'line-clamp-2'
                  }`}
                >
                  {displayDescription}
                </p>
                {isDescriptionOverflowing && (
                  <button
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline focus:outline-none"
                  >
                    {isDescriptionExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        <span>Show Less</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        <span>Show More</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              {translations.stock}: {product.stock ?? '-'}
            </p>
            
            {/* Condition */}
            {product.condition && (
              <p className="mb-2 text-sm text-muted-foreground">
                {t('condition')}: 
                {product.condition === 'new' && t('conditionNew')}
                {product.condition === 'like_new' && t('conditionLikeNew')}
                {product.condition === 'ninety_five' && t('conditionNinetyFive')}
                {product.condition === 'ninety' && t('conditionNinety')}
                {product.condition === 'eighty' && t('conditionEighty')}
                {product.condition === 'seventy_or_below' && t('conditionSeventyOrBelow')}
              </p>
            )}
            
            {/* Shipping Fee */}
            {product.shipping_fee && product.shipping_fee > 0 ? (
              <p className="mb-2 text-sm text-muted-foreground">
                {t('shippingFee')}: {shippingFeeDisplay.main}
              </p>
            ) : null}

            {/* Sales Countries */}
            {(product.sales_countries == null || product.sales_countries.length === 0) ? (
              <p className="mb-2 text-sm text-muted-foreground">
                {translations.salesCountries}: {translations.salesCountriesGlobal}
              </p>
            ) : (
              <p className="mb-2 text-sm text-muted-foreground">
                {translations.salesCountries}: {translations.salesCountriesTo} {product.sales_countries.map((code: string) => getCountryDisplayName(code, locale as 'zh' | 'en')).join(', ')}
              </p>
            )}
            
            {/* Color Selector */}
            {product.color_options && product.color_options.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-medium">{translations.colorOptions}</p>
                <div className="flex flex-wrap gap-3">
                  {product.color_options.map((colorOption: any, index: number) => (
                    <div
                      key={index}
                      className={`cursor-pointer border-2 rounded-md p-2 flex items-center gap-2 ${selectedColor === colorOption.name ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'}`}
                      onClick={() => {
                        setSelectedColor(colorOption.name);
                        // Set color image if available, otherwise use product's main image
                        if (colorOption.image_url) {
                          setSelectedColorImage(colorOption.image_url);
                        } else if (colorOption.image_from_index !== null && product.images && product.images[colorOption.image_from_index]) {
                          setSelectedColorImage(product.images[colorOption.image_from_index]);
                          setCurrentImageIndex(colorOption.image_from_index);
                        } else if (product.images && product.images.length > 0) {
                          setSelectedColorImage(product.images[0]);
                          setCurrentImageIndex(0);
                        } else {
                          setSelectedColorImage(null);
                        }
                      }}
                    >
                      {(colorOption.image_url || (colorOption.image_from_index !== null && product.images && product.images[colorOption.image_from_index]) || product.images && product.images.length > 0) ? (
                        <div className="w-10 h-10 rounded overflow-hidden">
                            <img
                              src={colorOption.image_url || (colorOption.image_from_index !== null && product.images ? product.images[colorOption.image_from_index] : null) || product.images[0]}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={handleImageError}
                            />
                          </div>
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                          <span className="text-xs text-gray-500">{translations.noImageColor}</span>
                        </div>
                      )}
                      <span className="text-sm">{getLocalizedColorName(colorOption.name, locale)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Size Selector */}
            {product.sizes && Array.isArray(product.sizes) && product.sizes.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-medium">{translations.selectSize || '选择尺寸'}</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s: string, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      className={`px-3 py-1.5 rounded-md border-2 text-sm ${
                        selectedSize === s ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onClick={() => setSelectedSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
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
                      name: displayName,
                      price: product.price,
                      image: selectedColorImage || product.images?.[0],
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
            {/* Quantity Selector */}
            <div className="flex items-center border rounded-md w-fit">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <span className="text-lg">−</span>
              </Button>
              <div className="w-12 text-center text-sm font-medium">
                {quantity}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => {
                  const maxQuantity = product.stock !== null && product.stock !== undefined
                    ? Math.min(product.stock, quantity + 1)
                    : quantity + 1;
                  setQuantity(maxQuantity);
                }}
                disabled={product.stock !== null && product.stock !== undefined && quantity >= product.stock}
              >
                <span className="text-lg">+</span>
              </Button>
            </div>

            <Button
              size="lg"
              className="flex-1"
              onClick={handleAddToCart}
              disabled={adding || (product.stock !== null && product.stock <= 0)}
            >
              {adding ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  <span className="flex items-center gap-0.5">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                  </span>
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  {translations.addToCart}
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={handleBuyNow}
              disabled={buying || (product.stock !== null && product.stock <= 0)}
            >
              {buying ? (
                <span className="flex items-center gap-0.5">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                </span>
              ) : (
                translations.buyNow
              )}
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
        productDetails={displayDetails}
        productFaq={locale === product.content_lang 
          ? product.faq 
          : (product.faq_translated || product.faq) as Array<{ question: string; answer: string }> | null}
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
          title={displayName || translations.viewProduct}
          description={displayDescription || undefined}
          image={product.images?.[0]}
          itemType="product"
          itemId={productId}
        />
      )}

      {/* Lightbox 组件 */}
      <ImageLightbox
        images={selectedColorImage ? [selectedColorImage] : (product.images?.filter((img): img is string => typeof img === 'string') || [])}
        initialIndex={selectedColorImage ? 0 : currentImageIndex}
        isOpen={showLightbox}
        onClose={() => setShowLightbox(false)}
        onIndexChange={handleLightboxIndexChange}
      />
    </div>
  )
}
