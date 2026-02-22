'use client'

/** 商品卡片领域类型（Anti-Corruption Layer 产物） */

export type ProductCardContext = 'shop' | 'profile' | 'search' | 'favorites' | 'embed'

export interface ListProductSellerDTO {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface ListProductContentDTO {
  name: string
  description: string | null
  images: string[]
  contentLang: 'zh' | 'en' | null
  nameTranslated: string | null
  descriptionTranslated: string | null
  /** AI 生成的分类原文，非硬编码 */
  category: string | null
  categoryTranslated: string | null
  /** 商品成色 */
  condition: 'new' | 'like_new' | 'ninety_five' | 'ninety' | 'eighty' | 'seventy_or_below' | null
  /** 商品运费 */
  shippingFee?: number
  /** 销售国家/地区 */
  salesCountries?: string[]
  /** 颜色选项 */
  colorOptions?: Array<{ name: string; image_url: string | null; image_from_index: number | null }> | null
  /** 尺寸选项 */
  sizes?: string[] | null
}

export interface ListProductStatsDTO {
  likeCount: number
  wantCount: number
  shareCount: number
  repostCount: number
  favoriteCount: number
  salesCount: number
}

/** 编排层从 cart store 注入，state 只读 */
export interface ListProductViewerInteractionDTO {
  isInCart: boolean
}

export interface ListProductDTO {
  id: string
  seller: ListProductSellerDTO
  content: ListProductContentDTO
  price: number
  currency: string
  stock: number
  status: string
  stats: ListProductStatsDTO
  viewerInteraction?: ListProductViewerInteractionDTO
}

export type ProductCardViewerKind = 'guest' | 'owner' | 'admin' | 'other'

export type ProductStockStatus = 'available' | 'soldOut' | 'hidden'

export interface ProductCardState {
  productId: string
  viewer: ProductCardViewerKind
  stockStatus: ProductStockStatus
  interaction: {
    isInCart: boolean
  }
}

export interface ProductCardCapabilities {
  canLike: boolean
  canFavorite: boolean
  canShare: boolean
  canRepost: boolean
  canReport: boolean

  canEdit: boolean
  canDelete: boolean
  canBuy: boolean
  canAddToCart: boolean
  canMessageSeller: boolean
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
