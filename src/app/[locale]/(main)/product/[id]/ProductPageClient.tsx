'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCartStore } from '@/store/cartStore'
import { useIsFavorite, useToggleFavorite } from '@/lib/hooks/useFavorites'
import { useRepost } from '@/lib/hooks/useRepost'
import { useRecordView } from '@/lib/hooks/useViewHistory'
import { useTrackView } from '@/lib/hooks/useTrackView'
import { showSuccess, showError } from '@/lib/utils/toast'
import { useTranslations, useLocale } from 'next-intl'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { initializeAffiliateAttribution } from '@/lib/utils/affiliate-attribution'
import { mapServerProductToListProductDTO } from '@/lib/product-card/mappers'
import { computeProductCardState, computeProductCardCapabilities } from '@/lib/product-card/state'
import { useProductDetailActions } from '@/lib/product-card/useProductDetailActions'
import { ProductDetailView } from '@/components/ecommerce/product-detail/ProductDetailView'
import { TrustJudgmentBlock } from '@/components/ecommerce/TrustJudgmentBlock'
import { ChatButton } from '@/components/social/ChatButton'
import type { TrustJudgmentResponse } from '@/app/api/trust/judgment/route'

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
    redirectingCheckout: string
    noImage: string
    removeFromFavorites: string
    addToFavorites: string
    chatWithSeller: string
  }
}

export function ProductPageClient({ product, user: initialUser, translations }: ProductPageClientProps) {
  const { user, loading: authLoading } = useAuth()
  const items = useCartStore((s) => s.items)
  const locale = useLocale()
  const t = useTranslations('products')
  const tCommon = useTranslations('common')
  const tPosts = useTranslations('posts')
  const tMessages = useTranslations('messages')

  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  /** 转发成功后的计数增量（商品详情数据来自 server props，invalidate 无组件订阅，用本地增量保证立即更新） */
  const [repostCountDelta, setRepostCountDelta] = useState(0)
  /** Phase 2 信任判断：仅当 canMessageSeller 时请求 */
  const [trustJudgment, setTrustJudgment] = useState<TrustJudgmentResponse | null>(null)
  const [trustJudgmentLoading, setTrustJudgmentLoading] = useState(false)

  const dto = useMemo(() => {
    const base = mapServerProductToListProductDTO(product)
    const isInCart = items.some((item) => item.product_id === product.id)
    return { ...base, viewerInteraction: { isInCart } }
  }, [product, items])

  const state = useMemo(
    () => computeProductCardState({ dto, viewerId: user?.id ?? null }),
    [dto, user?.id]
  )

  const capabilities = useMemo(
    () => computeProductCardCapabilities({ state, dto }),
    [state, dto]
  )

  useEffect(() => {
    if (!capabilities.canMessageSeller || !user?.id || !product?.id || !dto?.seller?.id) {
      setTrustJudgment(null)
      return
    }
    setTrustJudgmentLoading(true)
    const params = new URLSearchParams({ productId: product.id, sellerId: dto.seller.id })
    fetch(`/api/trust/judgment?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TrustJudgmentResponse | null) => setTrustJudgment(data ?? null))
      .catch(() => setTrustJudgment(null))
      .finally(() => setTrustJudgmentLoading(false))
  }, [capabilities.canMessageSeller, user?.id, product?.id, dto?.seller?.id])

  /** 展示用 dto：合并转发成功后的本地计数增量，使商品详情页转发数即时更新（与帖子详情页 invalidate 后 refetch 行为一致） */
  const viewDto = useMemo(
    () => ({
      ...dto,
      stats: {
        ...dto.stats,
        repostCount: (dto.stats.repostCount ?? 0) + repostCountDelta,
      },
    }),
    [dto, repostCountDelta]
  )

  const displayName = useMemo(
    () => getDisplayContent(locale, dto.content.contentLang, dto.content.name, dto.content.nameTranslated),
    [locale, dto.content.contentLang, dto.content.name, dto.content.nameTranslated]
  )
  const displayDescription = useMemo(
    () => getDisplayContent(locale, dto.content.contentLang, dto.content.description, dto.content.descriptionTranslated),
    [locale, dto.content.contentLang, dto.content.description, dto.content.descriptionTranslated]
  )
  const displayCategory = useMemo(
    () =>
      getDisplayContent(
        locale,
        dto.content.contentLang,
        dto.content.category ?? null,
        dto.content.categoryTranslated ?? null
      ) || null,
    [locale, dto.content.contentLang, dto.content.category, dto.content.categoryTranslated]
  )

  const contentLang = dto.content.contentLang ?? null

  const displayDetails = useMemo(
    () =>
      getDisplayContent(
        locale,
        contentLang,
        product?.details ?? null,
        product?.details_translated ?? null
      ),
    [locale, contentLang, product?.details, product?.details_translated]
  )

  const parsedFaq = useMemo(() => {
    const raw = product?.faq
    if (!raw) return null
    try {
      return Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }, [product?.faq])

  const faqTranslated = useMemo(() => {
    const raw = product?.faq_translated
    if (!raw || !Array.isArray(raw)) return null
    return raw as Array<{ question?: string; answer?: string }>
  }, [product?.faq_translated])

  const displayFaq = useMemo((): Array<{ question: string; answer: string }> | null => {
    const list = Array.isArray(parsedFaq) ? parsedFaq : null
    if (!list || list.length === 0) return null
    const translated = faqTranslated
    return list.map((item, i) => {
      const q = typeof item.question === 'string' ? item.question : ''
      const a = typeof item.answer === 'string' ? item.answer : ''
      const t = translated && translated[i]
      const tq = typeof t?.question === 'string' ? t.question : null
      const ta = typeof t?.answer === 'string' ? t.answer : null
      return {
        question: getDisplayContent(locale, contentLang, q || null, tq ?? undefined),
        answer: getDisplayContent(locale, contentLang, a || null, ta ?? undefined),
      }
    })
  }, [locale, contentLang, parsedFaq, faqTranslated])

  const actions = useProductDetailActions({ dto, displayName, displayDescription })

  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
  const priceDisplay = useMemo(
    () => formatPriceWithConversion(dto.price, (dto.currency as Currency) || 'USD', userCurrency),
    [dto.price, dto.currency, userCurrency]
  )
  const salesCountText = useMemo(() => {
    if (dto.stats.salesCount <= 0) return undefined
    return t('salesCount', { count: dto.stats.salesCount })
  }, [dto.stats.salesCount, t])

  const { data: isFavorite } = useIsFavorite('product', dto.id)
  const toggleFavoriteMutation = useToggleFavorite()
  const repostMutation = useRepost()
  const recordViewMutation = useRecordView()
  const hasRecordedViewRef = useRef(false)

  useEffect(() => {
    initializeAffiliateAttribution()
  }, [])

  useEffect(() => {
    if (
      !hasRecordedViewRef.current &&
      user &&
      product?.status === 'active' &&
      dto.id
    ) {
      hasRecordedViewRef.current = true
      recordViewMutation.mutate(
        { itemType: 'product', itemId: dto.id },
        { onError: () => {} }
      )
    }
  }, [user, product?.status, dto.id])

  useTrackView(product?.status === 'active' ? 'product' : null, product?.status === 'active' ? dto.id : null)

  const handleToggleFavorite = () => {
    if (!user) return
    toggleFavoriteMutation.mutate(
      { itemType: 'product', itemId: dto.id, isFavorite: isFavorite ?? false },
      {
        onSuccess: () => {
          if (isFavorite) {
            showSuccess(viewTranslations.removeFromFavorites)
          } else {
            showSuccess(viewTranslations.addToFavorites)
          }
        },
        onError: () => {
          showError(t('operationFailed'))
        },
      }
    )
  }

  const handleRepostConfirm = (targetUserIds: string[], content?: string) => {
    if (!targetUserIds?.length) {
      showError(t('selectAtLeastOneUser'))
      return
    }
    repostMutation.mutate(
      { itemType: 'product', itemId: dto.id, targetUserIds, content, userId: user?.id ?? undefined },
      {
        onSuccess: (result) => {
          setShowRepostDialog(false)
          if (result.count > 0) setRepostCountDelta((prev) => prev + result.count)
          if (result.count > 0 && result.alreadyExists > 0) {
            showSuccess(t('repostSuccessWithExists', { count: result.count, alreadyExists: result.alreadyExists }))
          } else if (result.count > 0) {
            showSuccess(t('repostSuccess', { count: result.count }))
          } else if (result.alreadyExists > 0) {
            showSuccess(t('repostAlreadyExists'))
          } else {
            showError(t('repostFailed'))
          }
        },
        onError: (error: any) => {
          const msg = error?.message ?? ''
          const isAuth = /authenticated|登录|unauthorized/i.test(msg)
          const isRls = /row-level security|policy|permission|RLS/i.test(msg)
          if (isAuth) {
            showError(t('loginToRepost'))
          } else if (isRls) {
            showError(t('noPermissionToRepost'))
          } else if (msg) {
            showError(msg.length > 60 ? t('repostFailed') : msg)
          } else {
            showError(t('repostFailed'))
          }
        },
      }
    )
  }

  const productUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/product/${dto.id}`
    return `${window.location.origin}/product/${dto.id}`
  }, [dto.id])

  /** 使用客户端 useTranslations 保证与 URL locale 一致（Description、Stock、Seller、Message seller、Add to Cart、Buy Now 等） */
  const viewTranslations = useMemo(
    () => ({
      loadFailed: t('loadFailed'),
      description: t('description'),
      stock: t('stock'),
      seller: t('seller'),
      report: t('report'),
      addedToCart: t('addedToCart'),
      addToCart: t('addToCart'),
      buyNow: t('buyNow'),
      redirectingCheckout: t('redirectingCheckout'),
      noImage: tCommon('noImage'),
      removeFromFavorites: tPosts('removeFromFavorites'),
      addToFavorites: tPosts('addToFavorites'),
      chatWithSeller: tMessages('chatWithSeller'),
      openProduct: t('openProduct'),
    }),
    [t, tCommon, tPosts, tMessages]
  )

  const chatSellerButton = useMemo(
    () =>
      capabilities.canMessageSeller ? (
        <ChatButton
          targetUserId={dto.seller.id}
          targetUserName={dto.seller.displayName}
          variant="outline"
          size="sm"
          shareCard={{
            type: 'product',
            id: dto.id,
            name: displayName,
            price: dto.price,
            image: dto.content.images[0],
            url: productUrl,
          }}
        >
          {viewTranslations.chatWithSeller}
        </ChatButton>
      ) : null,
    [
      capabilities.canMessageSeller,
      dto.seller.id,
      dto.seller.displayName,
      dto.id,
      displayName,
      dto.price,
      dto.content.images,
      productUrl,
      viewTranslations.chatWithSeller,
    ]
  )

  const trustJudgmentBlock = useMemo(() => {
    if (trustJudgmentLoading || !trustJudgment || !product?.id || !dto?.seller?.id) return null
    return (
      <TrustJudgmentBlock
        productId={product.id}
        sellerId={dto.seller.id}
        data={trustJudgment}
      />
    )
  }, [trustJudgmentLoading, trustJudgment, product?.id, dto?.seller?.id])

  return (
    <ProductDetailView
      dto={viewDto}
      state={state}
      capabilities={capabilities}
      actions={actions}
      displayName={displayName}
      displayDescription={displayDescription}
      translations={{
        ...viewTranslations,
        loading: tCommon('loading'),
        buyNowLoading: viewTranslations.redirectingCheckout,
      }}
      priceDisplay={priceDisplay}
      salesCountText={salesCountText}
      displayCategory={displayCategory}
      details={displayDetails || null}
      faq={displayFaq}
      showReportDialog={showReportDialog}
      setShowReportDialog={setShowReportDialog}
      showRepostDialog={showRepostDialog}
      setShowRepostDialog={setShowRepostDialog}
      showShareDialog={showShareDialog}
      setShowShareDialog={setShowShareDialog}
      onRepostConfirm={handleRepostConfirm}
      repostPending={repostMutation.isPending}
      isFavorite={!!isFavorite}
      onToggleFavorite={handleToggleFavorite}
      favoritePending={toggleFavoriteMutation.isPending}
      authLoading={authLoading}
      chatSellerButton={chatSellerButton}
      trustJudgmentBlock={trustJudgmentBlock}
    />
  )
}
