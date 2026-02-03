'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCartStore } from '@/store/cartStore'
import { createClient } from '@/lib/supabase/client'
import { showError, showInfo } from '@/lib/utils/toast'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { openChat } from '@/lib/chat/ChatNavigationService'
import { getOrCreateConversationCore } from '@/lib/chat/getOrCreateConversationCore'
import type { ListProductDTO } from './types'
import type { ProductCardCapabilities } from './types'

export interface UseProductDetailActionsParams {
  dto: ListProductDTO
  displayName: string
  displayDescription: string
}

export interface ProductDetailActions {
  adding: boolean
  buying: boolean
  /** 正在打开聊天（咨询卖家） */
  messageSellerLoading: boolean
  addToCart: () => Promise<void>
  buyNow: () => Promise<void>
  messageSeller: () => Promise<void>
  requestReportDialog: () => boolean
  getProductUrl: () => string
}

/**
 * 详情页行为层：唯一触达 API/RPC，不做 capability 判断（View 用 capabilities 显隐）。
 * 可购买性唯一权威：validate-product API。
 */
export function useProductDetailActions({
  dto,
  displayName,
  displayDescription,
}: UseProductDetailActionsParams): ProductDetailActions {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClient(), [])
  const addItem = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)
  const t = useTranslations('products')
  const tCommon = useTranslations('common')

  const [adding, setAdding] = useState(false)
  const [buying, setBuying] = useState(false)
  const [messageSellerLoading, setMessageSellerLoading] = useState(false)

  const getProductUrl = useCallback(() => {
    if (typeof window === 'undefined') return `/product/${dto.id}`
    return `${window.location.origin}/product/${dto.id}`
  }, [dto.id])

  const VALIDATE_TIMEOUT_MS = 8000 // 关键路径：10 秒内必达，校验限 8 秒

  const addToCart = useCallback(async () => {
    if (dto.viewerInteraction?.isInCart) return

    const productIdForCart = dto.id
    addItem({
      product_id: productIdForCart,
      quantity: 1,
      price: dto.price,
      name: displayName,
      image: dto.content.images[0] ?? '',
    })
    setAdding(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS)
      const res = await fetch('/api/checkout/validate-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ productId: productIdForCart }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.ok) {
        removeItem(productIdForCart)
        const reason = data?.reason ?? 'server_error'
        if (reason === 'not_found') showError(t('productNotFoundOrDeleted'))
        else if (reason === 'inactive') showError(t('productInactiveCannotAdd'))
        else if (reason === 'out_of_stock') showError(t('productOutOfStockCannotAdd'))
        else showError(t('validationFailedRetry'))
        setAdding(false)
        return
      }
      const p = data.product
      if (!p?.id || p.price == null) {
        removeItem(productIdForCart)
        showError(t('validationFailedRetry'))
        setAdding(false)
        return
      }
      removeItem(productIdForCart)
      addItem({
        product_id: p.id,
        quantity: 1,
        price: p.price,
        name: displayName,
        image: p.image ?? dto.content.images[0] ?? '',
      })
    } catch (err: any) {
      removeItem(productIdForCart)
      if (process.env.NODE_ENV === 'development') {
        console.error('Add to cart error:', err)
      }
      const isAbort = err?.name === 'AbortError'
      showError(isAbort ? t('validationTimeoutRetry') : t('validationFailedRetry'))
    } finally {
      setAdding(false)
    }
  }, [dto, displayName, addItem, removeItem, t])

  const buyNow = useCallback(async () => {
    setBuying(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS)
      const res = await fetch('/api/checkout/validate-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ productId: dto.id }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data?.ok) {
        const reason = data?.reason ?? 'server_error'
        if (reason === 'not_found') showError(t('productNotFoundOrDeleted'))
        else if (reason === 'inactive') showError(t('productInactiveCannotBuy'))
        else if (reason === 'out_of_stock') showError(t('productOutOfStockCannotBuy'))
        else if (reason === 'unauthorized') showError(t('pleaseLoginToBuy'))
        else showError(t('validationFailedRefresh'))
        setBuying(false)
        return
      }
      const p = data.product
      if (!p?.id || p.price == null) {
        showError(t('validationFailedRefresh'))
        setBuying(false)
        return
      }
      addItem({
        product_id: p.id,
        quantity: 1,
        price: p.price,
        name: displayName,
        image: p.image ?? dto.content.images[0] ?? '',
      })
      router.push('/checkout')
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Buy Now error:', err)
      }
      const isAbort = err?.name === 'AbortError'
      showError(isAbort ? t('validationTimeoutRetry') : t('validationFailedRetry'))
    } finally {
      setBuying(false)
    }
  }, [dto.id, dto.content.images, displayName, addItem, router, t])

  const messageSeller = useCallback(async () => {
    if (!user) {
      showInfo(t('pleaseLoginToMessage'))
      return
    }
    if (dto.seller.id === user.id) return
    if (messageSellerLoading) return
    setMessageSellerLoading(true)
    try {
      await openChat(
        { targetUserId: dto.seller.id },
        {
          getConversationId: (tid) =>
            getOrCreateConversationCore(supabase, user.id, tid),
          navigate: (path) => router.push(path),
          invalidateConversations: () => {
            queryClient.invalidateQueries({
              queryKey: ['conversations', user.id],
            })
            queryClient.invalidateQueries({
              queryKey: ['conversationDetails', user.id],
            })
          },
        }
      )
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? ''
      const isAbort =
        (err as { name?: string })?.name === 'AbortError' ||
        msg.includes('aborted') ||
        msg.includes('请求被取消')
      const isTimeout = msg.includes('超时')
      showError(
        isTimeout
          ? msg
          : isAbort
            ? t('requestCancelledRetry')
            : msg.includes('私聊')
              ? msg
              : t('cannotStartChat', { error: msg })
      )
    } finally {
      setMessageSellerLoading(false)
    }
  }, [dto.seller.id, user, supabase, router, queryClient, t])

  const requestReportDialog = useCallback(() => {
    if (!user) {
      showInfo(t('pleaseLoginToReport'))
      return false
    }
    return true
  }, [user, t])

  return {
    adding,
    buying,
    messageSellerLoading,
    addToCart,
    buyNow,
    messageSeller,
    requestReportDialog,
    getProductUrl,
  }
}
