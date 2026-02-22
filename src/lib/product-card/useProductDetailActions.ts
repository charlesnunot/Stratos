'use client'

import { useCallback, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useConversation } from '@/lib/hooks/useConversation'
import { useCartStore } from '@/store/cartStore'
import { showError, showInfo } from '@/lib/utils/toast'
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
  const { getOrCreateConversation } = useConversation()
  const addItem = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)

  const [adding, setAdding] = useState(false)
  const [buying, setBuying] = useState(false)

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
      currency: dto.currency,
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
        if (reason === 'not_found') showError('商品不存在或已被删除')
        else if (reason === 'inactive') showError('商品已下架，无法加入购物车')
        else if (reason === 'out_of_stock') showError('商品库存不足，无法加入购物车')
        else showError('验证失败，请重试')
        setAdding(false)
        return
      }
      const p = data.product
      if (!p?.id || p.price == null) {
        removeItem(productIdForCart)
        showError('验证失败，请重试')
        setAdding(false)
        return
      }
      removeItem(productIdForCart)
      addItem({
        product_id: p.id,
        quantity: 1,
        price: p.price,
        currency: p.currency,
        name: p.name ?? displayName,
        image: p.image ?? dto.content.images[0] ?? '',
      })
    } catch (err: any) {
      removeItem(productIdForCart)
      if (process.env.NODE_ENV === 'development') {
        console.error('Add to cart error:', err)
      }
      const isAbort = err?.name === 'AbortError'
      showError(isAbort ? '验证超时，请重试' : '验证失败，请重试')
    } finally {
      setAdding(false)
    }
  }, [dto, displayName, addItem, removeItem])

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
        if (reason === 'not_found') showError('商品不存在或已被删除')
        else if (reason === 'inactive') showError('商品已下架，无法购买')
        else if (reason === 'out_of_stock') showError('商品库存不足，无法购买')
        else if (reason === 'unauthorized') showError('请先登录后再购买')
        else showError('验证失败，请刷新页面后重试')
        setBuying(false)
        return
      }
      const p = data.product
      if (!p?.id || p.price == null) {
        showError('验证失败，请刷新页面后重试')
        setBuying(false)
        return
      }
      addItem({
        product_id: p.id,
        quantity: 1,
        price: p.price,
        currency: p.currency,
        name: p.name ?? displayName,
        image: p.image ?? dto.content.images[0] ?? '',
      })
      router.push('/checkout')
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Buy Now error:', err)
      }
      const isAbort = err?.name === 'AbortError'
      showError(isAbort ? '验证超时，请重试' : '验证失败，请重试')
    } finally {
      setBuying(false)
    }
  }, [dto.id, dto.content.images, displayName, addItem, router])

  const messageSeller = useCallback(async () => {
    if (!user) {
      showInfo('请先登录后再私聊')
      return
    }
    if (dto.seller.id === user.id) return
    try {
      const conversationId = await getOrCreateConversation(dto.seller.id)
      router.push(`/messages/${conversationId}`)
    } catch (err: any) {
      const msg = err?.message ?? ''
      const isAbort = err?.name === 'AbortError' || msg.includes('aborted') || msg.includes('请求被取消')
      const isTimeout = msg.includes('超时')
      showError(isTimeout ? msg : isAbort ? '请求被取消，请重试' : msg.includes('私聊') ? msg : `无法发起私聊: ${msg}`)
    }
  }, [dto.seller.id, user, getOrCreateConversation, router])

  const requestReportDialog = useCallback(() => {
    if (!user) {
      showInfo('请先登录后再举报')
      return false
    }
    return true
  }, [user])

  return {
    adding,
    buying,
    addToCart,
    buyNow,
    messageSeller,
    requestReportDialog,
    getProductUrl,
  }
}
