// Cart CRDT System - Product Card Actions (v5)
// ============================================================
// Modern product card actions with CRDT cart integration
// ============================================================

import { useCallback } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { showSuccess, showError } from '@/lib/utils/toast'
import { useCartV5 } from '@/lib/hooks/useCartV5'
import { generateSkuId } from '@/lib/cart'
import type { ListProductDTO, ProductCardCapabilities, ProductActions } from './types'

export interface UseProductCardActionsV5Props {
  dto: ListProductDTO
  capabilities: ProductCardCapabilities
}

export function useProductCardActionsV5({ dto, capabilities }: UseProductCardActionsV5Props): ProductActions {
  const router = useRouter()
  const t = useTranslations('products')
  const tCommon = useTranslations('common')
  
  // Use new cart hook
  const { addItem, getItemQuantity } = useCartV5()

  const getProductUrl = useCallback(() => {
    return `/product/${dto.id}`
  }, [dto.id])

  const handleAddToCart = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      // Check if product has options (color/size)
      const hasOptions = Boolean(
        dto.content.colorOptions?.length || dto.content.sizes?.length
      )

      if (hasOptions) {
        // Redirect to product detail page to select options
        router.push(`/product/${dto.id}` as any)
        return
      }

      // Add to cart using new CRDT system
      await addItem(dto.id, 1, null, null)
      
      showSuccess(t('addedToCart'))
      
    } catch (error) {
      console.error('Failed to add to cart:', error)
      showError(tCommon('error'))
    }
  }, [dto.id, dto.content.colorOptions, dto.content.sizes, addItem, router, t, tCommon])

  const handleBuyNow = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      // Check if product has options (color/size)
      const hasOptions = Boolean(
        dto.content.colorOptions?.length || dto.content.sizes?.length
      )

      if (hasOptions) {
        // Redirect to product detail page to select options
        router.push(`/product/${dto.id}` as any)
        return
      }

      // Add to cart using new CRDT system
      await addItem(dto.id, 1, null, null)
      
      // Immediately redirect to checkout
      router.push('/checkout')
      
    } catch (error) {
      console.error('Failed to buy now:', error)
      showError(tCommon('error'))
    }
  }, [dto.id, dto.content.colorOptions, dto.content.sizes, addItem, router, tCommon])

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (navigator.share) {
      navigator.share({
        title: dto.content.name,
        text: dto.content.description || '',
        url: window.location.origin + `/product/${dto.id}`,
      })
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.origin + `/product/${dto.id}`)
      showSuccess(tCommon('copied'))
    }
  }, [dto.content.name, dto.content.description, dto.id, tCommon])

  const handleReport = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Report functionality would be implemented here
    console.log('Report product:', dto.id)
  }, [dto.id])

  const handleRepost = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Repost functionality would be implemented here
    console.log('Repost product:', dto.id)
  }, [dto.id])

  const handleFavorite = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Favorite functionality would be implemented here
    console.log('Favorite product:', dto.id)
  }, [dto.id])

  const handleLike = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Like functionality would be implemented here
    console.log('Like product:', dto.id)
  }, [dto.id])

  const handleWant = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Want functionality would be implemented here
    console.log('Want product:', dto.id)
  }, [dto.id])

  // Check if product is in cart
  const isInCart = useCallback((color?: string | null, size?: string | null): boolean => {
    const skuId = generateSkuId(dto.id, color, size)
    const quantity = getItemQuantity(skuId)
    return quantity > 0
  }, [dto.id, getItemQuantity])

  return {
    adding: false,
    buying: false,
    repostPending: false,
    getProductUrl,
    addToCart: handleAddToCart,
    buyNow: handleBuyNow,
    messageSeller: async () => {},
    requestReportDialog: () => false,
    copyLink: async () => {},
    repostToUsers: async () => 'ok',
    openProduct: () => router.push(`/product/${dto.id}` as any),
  }
}