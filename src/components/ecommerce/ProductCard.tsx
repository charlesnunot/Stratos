'use client'

import { useMemo } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useCartStore } from '@/store/cartStore'
import { ProductCardView } from './product-card/ProductCardView'
import { mapFeedProductToListProductDTO, type RawProduct } from '@/lib/product-card/mappers'
import { computeProductCardState, computeProductCardCapabilities } from '@/lib/product-card/state'
import { useProductCardActions } from '@/lib/product-card/useProductCardActions'
import type { ListProductDTO } from '@/lib/product-card/types'
import type { ProductCardContext } from '@/lib/product-card/types'

/** 各场景传入的 product 形状（与 useProducts / profile / search 等兼容） */
export interface ProductCardProduct {
  id: string
  name: string
  description: string | null
  content_lang?: 'zh' | 'en' | null
  name_translated?: string | null
  description_translated?: string | null
  category?: string | null
  category_translated?: string | null
  price: number
  images: string[]
  seller_id: string
  stock?: number | null
  status?: string
  like_count?: number
  want_count?: number
  share_count?: number
  repost_count?: number
  favorite_count?: number
  sales_count?: number
  currency?: string
  color_options?: Array<{ name: string; image_url: string | null; image_from_index: number | null }> | null
  sizes?: string[] | null
  seller?: {
    username: string
    display_name: string
    avatar_url: string | null
  }
}

export interface ProductCardProps {
  product: ProductCardProduct
  context?: ProductCardContext
}

export function ProductCard({ product, context = 'shop' }: ProductCardProps) {
  const { user } = useAuth()
  const items = useCartStore((s) => s.items)

  const dto: ListProductDTO = useMemo(() => {
    const base = mapFeedProductToListProductDTO(product as RawProduct)
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

  const actions = useProductCardActions({ dto, capabilities })

  return (
    <ProductCardView
      dto={dto}
      state={state}
      capabilities={capabilities}
      actions={actions}
    />
  )
}
