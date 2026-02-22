'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useConversation } from '@/lib/hooks/useConversation'
import { useRepost } from '@/lib/hooks/useRepost'
import { useCartStore } from '@/store/cartStore'
import { showError, showInfo, showSuccess, showWarning } from '@/lib/utils/toast'
import { buildProductUrlWithAffiliate, getAffiliatePostId } from '@/lib/utils/affiliate-attribution'
import type { ListProductDTO } from './types'
import type { ProductCardCapabilities } from './types'

export interface UseProductCardActionsParams {
  dto: ListProductDTO
  capabilities: ProductCardCapabilities
}

export interface ProductActions {
  adding: boolean
  buying: boolean
  repostPending: boolean

  addToCart: (e: React.MouseEvent) => Promise<void>
  buyNow: (e: React.MouseEvent) => Promise<void>
  messageSeller: () => Promise<void>
  requestReportDialog: () => boolean
  copyLink: () => Promise<void>
  repostToUsers: (targetUserIds: string[], content?: string) => Promise<'ok' | 'error'>
  openProduct: () => void
  getProductUrl: () => string
}

/**
 * 行为层（唯一允许 touching 世界）：
 * - supabase/queryClient/fetch/mutation/toast/clipboard/router 都在这里
 */
export function useProductCardActions({ dto, capabilities }: UseProductCardActionsParams): ProductActions {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { getOrCreateConversation } = useConversation()
  const addItem = useCartStore((s) => s.addItem)
  const removeItem = useCartStore((s) => s.removeItem)

  const repostMutation = useRepost()
  const [adding, setAdding] = useState(false)
  const [buying, setBuying] = useState(false)

  const getProductUrl = useCallback(() => buildProductUrlWithAffiliate(dto.id, getAffiliatePostId()), [dto.id])

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
      showError(isAbort ? '请求被取消，请重试' : msg.includes('私聊') ? msg : `无法发起私聊: ${msg}`)
    }
  }, [dto.seller.id, user, getOrCreateConversation, router])

  // Check if product has color or size options
  const hasOptions = Boolean(
    dto.content.colorOptions?.length || dto.content.sizes?.length
  )

  const addToCart = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Prevent double click
      if (adding) return

      // If product has options, redirect to detail page to select
      if (hasOptions) {
        router.push(getProductUrl())
        return
      }

      if (dto.viewerInteraction?.isInCart) return

      const productIdForCart = dto.id
      addItem({
        product_id: productIdForCart,
        quantity: 1,
        price: dto.price,
        currency: dto.currency,
        name: dto.content.name,
        image: dto.content.images[0] || '',
      })
      setAdding(true)
      try {
        const res = await fetch('/api/checkout/validate-product', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ productId: productIdForCart }),
        })
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
          name: p.name ?? dto.content.name,
          image: p.image ?? dto.content.images[0] ?? '',
        })
      } catch (err) {
        removeItem(productIdForCart)
        if (process.env.NODE_ENV === 'development') {
          console.error('Add to cart error:', err)
        }
        showError('验证失败，请重试')
      } finally {
        setAdding(false)
      }
    },
    [dto, addItem, removeItem, hasOptions, router, getProductUrl]
  )

  const buyNow = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Prevent double click
      if (buying) return

      // If product has options, redirect to detail page to select
      if (hasOptions) {
        router.push(getProductUrl())
        return
      }

      setBuying(true)
      try {
        const res = await fetch('/api/checkout/validate-product', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ productId: dto.id }),
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok || !data?.ok) {
          const reason = data?.reason ?? 'server_error'
          if (reason === 'not_found') showError('商品不存在或已被删除')
          else if (reason === 'inactive') showError('商品已下架，无法购买')
          else if (reason === 'out_of_stock') showError('商品库存不足，无法购买')
          else showError('验证失败，请重试')
          setBuying(false)
          return
        }
        const p = data.product
        if (!p?.id || p.price == null) {
          showError('验证失败，请重试')
          setBuying(false)
          return
        }
        
        // Add item to cart before redirecting to checkout
        addItem({
          product_id: p.id,
          quantity: 1,
          price: p.price,
          currency: p.currency,
          name: p.name ?? dto.content.name,
          image: p.image ?? dto.content.images[0] ?? '',
        })
        
        router.push(`/checkout?product_id=${p.id}&quantity=1`)
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Buy now error:', err)
        }
        showError('验证失败，请重试')
      } finally {
        setBuying(false)
      }
    },
    [dto.id, dto.content.name, dto.content.images, router, hasOptions, getProductUrl, addItem]
  )

  const requestReportDialog = useCallback(() => {
    if (!user) {
      showInfo('请先登录后再举报')
      return false
    }
    return true
  }, [user])

  const copyLink = useCallback(async () => {
    try {
      const path = getProductUrl()
      const url = typeof window !== 'undefined' ? window.location.origin + path : path
      await navigator.clipboard.writeText(url)
      showSuccess('链接已复制到剪贴板')
      if (user) {
        try {
          const { error } = await supabase.from('shares').insert({
            user_id: user.id,
            item_type: 'product',
            item_id: dto.id,
          })
          if (error) throw error
        } catch (err: any) {
          const msg = String(err?.message ?? '')
          if (msg.includes('Rate limit exceeded')) showWarning('操作过于频繁，请稍后再试')
          else console.error('Failed to create share record:', err)
        }
      }
    } catch {
      showError('复制链接失败')
    }
  }, [dto.id, getProductUrl, supabase, user])

  const repostToUsers = useCallback(
    async (targetUserIds: string[], content?: string): Promise<'ok' | 'error'> => {
      if (!capabilities.canRepost) return 'error'
      if (!user) {
        showInfo('请先登录后再转发')
        return 'error'
      }
      return new Promise((resolve) => {
        repostMutation.mutate(
          { itemType: 'product', itemId: dto.id, targetUserIds, content },
          {
            onSuccess: (result) => {
              if (result.count > 0 && result.alreadyExists > 0) {
                showSuccess(`已转发给 ${result.count} 个用户（${result.alreadyExists} 个用户已接收过）`)
              } else if (result.count > 0) {
                showSuccess(`已转发给 ${result.count} 个用户`)
              } else if (result.alreadyExists > 0) {
                showInfo(`这些用户已经接收过此转发`)
              } else {
                showError('转发失败，请重试')
              }
              resolve('ok')
            },
            onError: (err: any) => {
              console.error('Repost error:', err)
              showError('转发失败，请重试')
              resolve('error')
            },
          }
        )
      })
    },
    [capabilities.canRepost, dto.id, repostMutation, user]
  )

  const openProduct = useCallback(() => {
    router.push(buildProductUrlWithAffiliate(dto.id, getAffiliatePostId()))
  }, [dto.id, router])

  return {
    adding,
    buying,
    repostPending: repostMutation.isPending,
    addToCart,
    buyNow,
    messageSeller,
    requestReportDialog,
    copyLink,
    repostToUsers,
    openProduct,
    getProductUrl,
  }
}
