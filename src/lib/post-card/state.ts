'use client'

import type {
  ListPostDTO,
  PostCardState,
  PostCardViewerKind,
  PostCardCapabilities,
} from './types'

export interface ComputePostCardInput {
  dto: ListPostDTO
  viewerId: string | null
  // Phase 0.5：先允许由上层“注入”更高等级身份；默认按 owner/other/guest 推导
  viewerKindOverride?: PostCardViewerKind
}

/**
 * 纯函数：计算 PostCardState（事实世界）
 * - 禁止 async / side effects / query / toast
 */
export function computePostCardState(input: ComputePostCardInput): PostCardState {
  const { dto, viewerId, viewerKindOverride } = input

  const viewerKind: PostCardViewerKind =
    viewerKindOverride ??
    (viewerId
      ? viewerId === dto.author.id
        ? 'owner'
        : 'other'
      : 'guest')

  return {
    postId: dto.id,
    viewer: viewerKind,
    visibility: dto.visibility,
    interaction: {
      isFollowingAuthor: !!dto.viewerInteraction?.isFollowingAuthor,
    },
  }
}

/**
 * 纯函数：计算 PostCardCapabilities（宪法世界）
 * - 能不能做只由 state/dto 派生；不依赖 context，不触发副作用
 */
export function computePostCardCapabilities(params: {
  state: PostCardState
  dto: ListPostDTO
}): PostCardCapabilities {
  const { state, dto } = params

  const isGuest = state.viewer === 'guest'
  const isOwner = state.viewer === 'owner'
  const isAdmin = state.viewer === 'admin'

  const isDeleted = dto.visibility === 'deleted'

  // 列表态：隐藏/删除时禁用大部分互动
  const canInteract = !isDeleted && !isGuest

  return {
    canLike: canInteract,
    canComment: canInteract,
    canFavorite: canInteract,
    canShare: !isDeleted, // 允许未登录复制/分享（按现有实现可进一步细化）
    canRepost: canInteract,

    canEdit: !isDeleted && (isOwner || isAdmin),
    canDelete: !isDeleted && (isOwner || isAdmin),
    canReport: !isDeleted && !isGuest && !isOwner,
    canViewStats: !isDeleted && (isOwner || isAdmin),

    canFollowAuthor: !isDeleted && !isGuest && !isOwner,
  }
}

