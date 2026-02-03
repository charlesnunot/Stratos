'use client'

import type { Post as RawPost } from '@/lib/hooks/usePosts'
import type { ListPostContentType, ListPostDTO, PostVisibility } from './types'

function normalizeVisibility(raw: RawPost): PostVisibility {
  // Phase 0.5：目前列表只拉 approved；预留后续支持 hidden/deleted
  // 若后端未来提供字段（例如 raw.deleted_at / raw.visibility），只改这里即可
  if (raw.status === 'deleted') return 'deleted'
  return 'normal'
}

/**
 * Anti-Corruption Layer：Feed 列表 raw post -> ListPostDTO
 * - 只负责“事实形态”，不掺 UI 与权限逻辑
 */
export function mapFeedPostToListPostDTO(raw: RawPost): ListPostDTO {
  return {
    id: raw.id,
    author: {
      id: raw.user_id,
      username: raw.user?.username || '',
      displayName: raw.user?.display_name || raw.user?.username || '',
      avatarUrl: raw.user?.avatar_url ?? null,
    },
    content: {
      text: raw.content ?? null,
      imageUrls: Array.isArray(raw.image_urls) ? raw.image_urls : [],
      topics: (raw.topics || []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        name_translated: t.name_translated ?? null,
        name_lang: t.name_lang ?? null,
      })),
      linkedProducts: raw.linkedProducts?.map((lp: any) => ({
        product_id: lp.product_id,
        sort_order: lp.sort_order ?? 0,
        product: lp.product
          ? { id: lp.product.id, name: lp.product.name, price: lp.product.price, images: lp.product.images ?? [], seller_id: lp.product.seller_id }
          : undefined,
      })),
      postType: raw.post_type as ListPostContentType | undefined,
      storyInfo: raw.story_info,
      musicInfo: raw.music_info,
      videoInfo: raw.video_info,
    },
    stats: {
      likeCount: raw.like_count ?? 0,
      commentCount: raw.comment_count ?? 0,
      shareCount: raw.share_count ?? 0,
      repostCount: raw.repost_count ?? 0,
      favoriteCount: raw.favorite_count ?? 0,
      tipAmount: raw.tip_amount ?? 0,
    },
    visibility: normalizeVisibility(raw),
    createdAt: raw.created_at,
    // raw.updated_at 在 Post interface 里不固定存在，这里做兼容
    updatedAt: (raw as any).updated_at ?? undefined,
    recommendationReason: raw.recommendationReason,
  }
}

/**
 * Anti-Corruption Layer：Profile 列表 raw post -> ListPostDTO
 * - 目前 Profile 的 raw 结构与 Feed 相同；分函数是为了未来差异扩展的“缓冲带”
 */
export function mapProfilePostToListPostDTO(raw: RawPost): ListPostDTO {
  return mapFeedPostToListPostDTO(raw)
}

