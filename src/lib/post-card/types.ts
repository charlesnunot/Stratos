'use client'

// PostCard 领域类型（Anti-Corruption Layer 产物）

export type PostCardContext = 'feed' | 'profile' | 'search' | 'topic' | 'favorites'

export interface ListPostAuthorDTO {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface ListPostTopicDTO {
  id: string
  name: string
  slug: string
  /** 另一种语言的译文，与 name_lang 配合按当前 locale 展示 */
  name_translated?: string | null
  /** name 的语言：zh | en */
  name_lang?: 'zh' | 'en' | null
}

export interface ListPostStatsDTO {
  likeCount: number
  commentCount: number
  shareCount: number
  repostCount: number
  favoriteCount: number
  tipAmount: number
}

export interface ListPostLinkedProductDTO {
  product_id: string
  sort_order: number
  product?: { id: string; name: string; price: number; images: string[]; seller_id: string }
}

/** 内容类型（与 Post post_type 一致） */
export type ListPostContentType =
  | 'text'
  | 'image'
  | 'story'
  | 'music'
  | 'short_video'
  | 'normal'
  | 'series'
  | 'affiliate'

export interface ListPostContentDTO {
  text: string | null
  imageUrls: string[]
  // 列表场景下，topics 用于展示即可（不要求全量）
  topics: ListPostTopicDTO[]
  linkedProducts?: ListPostLinkedProductDTO[]
  /** 内容类型，用于 PostCard 按类型渲染 */
  postType?: ListPostContentType
  storyInfo?: { chapter_number?: number; content_length?: number }
  musicInfo?: { music_url: string; duration_seconds?: number; cover_url?: string | null }
  videoInfo?: { video_url: string; duration_seconds?: number; cover_url?: string | null }
}

export type PostVisibility = 'normal' | 'hidden' | 'deleted'

/** Feed 推荐理由（仅主 Feed 有值）；含按 post_type 细化：story_topic / music_artist / short_video_trending */
export type FeedRecommendationReasonType =
  | 'followed_user'
  | 'followed_topic'
  | 'trending'
  | 'story_topic'
  | 'music_artist'
  | 'short_video_trending'

export interface ListPostViewerInteractionDTO {
  // Phase 0.5：只放列表层能稳定拿到或容易推导的互动事实
  // liked/favorited 暂由 LikeButton/FavoriteButton 内部处理，后续可扩展进来
  isFollowingAuthor?: boolean
}

export interface ListPostDTO {
  id: string
  author: ListPostAuthorDTO
  content: ListPostContentDTO
  stats: ListPostStatsDTO
  visibility: PostVisibility
  createdAt: string
  updatedAt?: string
  viewerInteraction?: ListPostViewerInteractionDTO
  /** 个性化 Feed 推荐理由（仅主 Feed 有值） */
  recommendationReason?: { reasonType: FeedRecommendationReasonType }
}

export type PostCardViewerKind = 'guest' | 'owner' | 'other' | 'admin'

export interface PostCardState {
  postId: string
  viewer: PostCardViewerKind
  visibility: PostVisibility
  interaction: {
    isFollowingAuthor: boolean
  }
}

export interface PostCardCapabilities {
  canLike: boolean
  canComment: boolean
  canFavorite: boolean
  canShare: boolean
  canRepost: boolean

  canEdit: boolean
  canDelete: boolean
  canReport: boolean
  canViewStats: boolean

  canFollowAuthor: boolean
}

