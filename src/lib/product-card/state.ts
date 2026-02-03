'use client'

import type {
  ListProductDTO,
  ProductCardState,
  ProductCardViewerKind,
  ProductCardCapabilities,
  ProductStockStatus,
} from './types'

export interface ComputeProductCardInput {
  dto: ListProductDTO
  viewerId: string | null
  viewerKindOverride?: ProductCardViewerKind
}

function deriveStockStatus(status: string, stock: number): ProductStockStatus {
  if (status !== 'active') return 'hidden'
  if (stock <= 0) return 'soldOut'
  return 'available'
}

/**
 * 纯函数：计算 ProductCardState（事实世界）
 * - 禁止 async / side effects / query / toast
 */
export function computeProductCardState(input: ComputeProductCardInput): ProductCardState {
  const { dto, viewerId, viewerKindOverride } = input

  const viewer: ProductCardViewerKind =
    viewerKindOverride ??
    (viewerId
      ? viewerId === dto.seller.id
        ? 'owner'
        : 'other'
      : 'guest')

  const stockStatus = deriveStockStatus(dto.status, dto.stock)

  return {
    productId: dto.id,
    viewer,
    stockStatus,
    interaction: {
      isInCart: !!dto.viewerInteraction?.isInCart,
    },
  }
}

/**
 * 纯函数：计算 ProductCardCapabilities（宪法世界）
 * - 能不能做只由 state/dto 派生；不依赖 context，不触发副作用
 */
export function computeProductCardCapabilities(params: {
  state: ProductCardState
  dto: ListProductDTO
}): ProductCardCapabilities {
  const { state, dto } = params

  const isGuest = state.viewer === 'guest'
  const isOwner = state.viewer === 'owner'
  const isAdmin = state.viewer === 'admin'

  const isAvailable = state.stockStatus === 'available'
  const isHidden = state.stockStatus === 'hidden'

  const canInteract = !isGuest

  return {
    canLike: canInteract && !isHidden,
    canFavorite: canInteract && !isHidden,
    canShare: !isHidden,
    canRepost: canInteract && !isHidden,
    canReport: canInteract && !isOwner && !isHidden,

    canEdit: !isHidden && (isOwner || isAdmin),
    canDelete: !isHidden && (isOwner || isAdmin),
    canBuy: isAvailable,
    canAddToCart: isAvailable,
    canMessageSeller: canInteract && !isOwner && !isHidden,
  }
}
