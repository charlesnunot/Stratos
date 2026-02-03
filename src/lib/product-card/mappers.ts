'use client'

import type { Product as RawProductFromHook } from '@/lib/hooks/useProducts'
import type { ListProductDTO } from './types'

/** Raw product 形状（各场景可能只含部分字段，mapper 做安全默认值） */
export type RawProduct = RawProductFromHook & {
  content_lang?: 'zh' | 'en' | null
  name_translated?: string | null
  description_translated?: string | null
  category_translated?: string | null
  repost_count?: number
}

function mapSeller(raw: RawProduct): ListProductDTO['seller'] {
  return {
    id: raw.seller_id,
    username: raw.seller?.username ?? '',
    displayName: raw.seller?.display_name ?? raw.seller?.username ?? '',
    avatarUrl: raw.seller?.avatar_url ?? null,
  }
}

/**
 * Anti-Corruption Layer：商品列表/店铺页 raw product -> ListProductDTO
 * - viewerInteraction 由编排层注入，不在此设置
 */
export function mapFeedProductToListProductDTO(raw: RawProduct): Omit<ListProductDTO, 'viewerInteraction'> {
  return {
    id: raw.id,
    seller: mapSeller(raw),
    content: {
      name: raw.name ?? '',
      description: raw.description ?? null,
      images: Array.isArray(raw.images) ? raw.images : [],
      contentLang: raw.content_lang ?? null,
      nameTranslated: raw.name_translated ?? null,
      descriptionTranslated: raw.description_translated ?? null,
      category: raw.category ?? null,
      categoryTranslated: raw.category_translated ?? null,
    },
    price: raw.price ?? 0,
    currency: raw.currency ?? 'USD',
    stock: raw.stock ?? 0,
    status: raw.status ?? 'draft',
    stats: {
      likeCount: raw.like_count ?? 0,
      wantCount: raw.want_count ?? 0,
      shareCount: raw.share_count ?? 0,
      repostCount: raw.repost_count ?? 0,
      favoriteCount: raw.favorite_count ?? 0,
      salesCount: raw.sales_count ?? 0,
    },
  }
}

/**
 * Anti-Corruption Layer：Profile 列表 raw product -> ListProductDTO
 */
export function mapProfileProductToListProductDTO(raw: RawProduct): Omit<ListProductDTO, 'viewerInteraction'> {
  return mapFeedProductToListProductDTO(raw)
}

/**
 * Anti-Corruption Layer：搜索页 raw product -> ListProductDTO
 */
export function mapSearchProductToListProductDTO(raw: RawProduct): Omit<ListProductDTO, 'viewerInteraction'> {
  return mapFeedProductToListProductDTO(raw)
}

/**
 * Anti-Corruption Layer：收藏夹等子集形状 -> ListProductDTO
 * - 字段可能不全，做安全默认值
 */
export function mapFavoriteItemProductToListProductDTO(
  raw: Partial<RawProduct> & { id: string; seller_id: string }
): Omit<ListProductDTO, 'viewerInteraction'> {
  return mapFeedProductToListProductDTO(raw as RawProduct)
}

/**
 * Anti-Corruption Layer：帖子内嵌商品 -> ListProductDTO
 */
export function mapEmbeddedProductToListProductDTO(
  raw: Partial<RawProduct> & { id: string; seller_id: string; name: string; price: number }
): Omit<ListProductDTO, 'viewerInteraction'> {
  return mapFeedProductToListProductDTO(raw as RawProduct)
}

/**
 * Anti-Corruption Layer：详情页服务端 product -> ListProductDTO
 * - 服务端 select 含 seller: { username, display_name }，无 avatar_url 时 mapSeller 置 null
 */
export function mapServerProductToListProductDTO(
  raw: RawProduct | (Omit<RawProduct, 'seller'> & { seller?: { username?: string; display_name?: string; avatar_url?: string | null } })
): Omit<ListProductDTO, 'viewerInteraction'> {
  return mapFeedProductToListProductDTO(raw as RawProduct)
}
