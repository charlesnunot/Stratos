/**
 * Shared post select and mapper for server (SSR) and client (usePosts).
 * Used by page.tsx server fetch and usePosts.ts.
 */

/** Feed 推荐理由类型：followed_user / followed_topic / trending；按 post_type 细化：story_topic / music_artist / short_video_trending */
export type FeedRecommendationReasonType =
  | 'followed_user'
  | 'followed_topic'
  | 'trending'
  | 'story_topic'
  | 'music_artist'
  | 'short_video_trending'

/** 内容类型：与 DB post_type 一致，含旧值 normal/series/affiliate */
export type PostType =
  | 'text'
  | 'image'
  | 'story'
  | 'music'
  | 'short_video'
  | 'normal'
  | 'series'
  | 'affiliate'

export interface Post {
  id: string
  user_id: string
  content: string | null
  content_lang?: 'zh' | 'en' | null
  content_translated?: string | null
  image_urls: string[]
  post_type?: string
  like_count: number
  comment_count: number
  share_count: number
  repost_count?: number
  favorite_count?: number
  tip_amount: number
  tip_enabled?: boolean
  created_at: string
  status?: string
  /** 故事：章节号、字数 */
  story_info?: { chapter_number?: number; content_length?: number }
  /** 音乐：音频 URL、时长（秒）、封面 URL */
  music_info?: { music_url: string; duration_seconds?: number; cover_url?: string | null }
  /** 短视频：视频 URL、时长、封面 URL */
  video_info?: { video_url: string; duration_seconds?: number; cover_url?: string | null }
  /** 个性化 Feed 推荐理由（仅登录用户主 Feed 有值） */
  recommendationReason?: {
    reasonType: FeedRecommendationReasonType
  }
  /** 帖子内嵌关联商品（阶段3 社区+电商） */
  linkedProducts?: Array<{
    product_id: string
    sort_order: number
    product?: { id: string; name: string; name_translated?: string | null; content_lang?: 'zh' | 'en' | null; price: number; currency?: string; images: string[]; seller_id: string; status?: string }
  }>
  affiliatePost?: {
    product?: { images?: string[] } & Record<string, unknown>
  }
  user?: {
    username: string
    display_name: string
    avatar_url: string | null
  }
  topics?: Array<{
    id: string
    name: string
    slug: string
    name_translated?: string | null
    name_lang?: 'zh' | 'en' | null
  }>
}

export const POST_SELECT = `
  *,
  user:profiles!posts_user_id_fkey (
    username,
    display_name,
    avatar_url
  ),
  topics:post_topics (
    topic:topics (
      id,
      name,
      slug,
      name_translated,
      name_lang
    )
  ),
  post_products (
    product_id,
    sort_order,
    product:products (
      id,
      name,
      name_translated,
      content_lang,
      price,
      currency,
      images,
      seller_id,
      status
    )
  )
`

export function mapRowToPost(post: any): Post {
  const linkedProducts = post.post_products
    ?.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((pp: any) => ({
      product_id: pp.product_id,
      sort_order: pp.sort_order ?? 0,
      product: pp.product
        ? {
            id: pp.product.id,
            name: pp.product.name,
            name_translated: pp.product.name_translated,
            content_lang: pp.product.content_lang,
            price: pp.product.price,
            currency: pp.product.currency,
            images: Array.isArray(pp.product.images) ? pp.product.images : [],
            seller_id: pp.product.seller_id,
            status: pp.product.status,
          }
        : undefined,
    }))
    .filter((pp: any) => pp.product && pp.product.status === 'active') ?? []

  const postType = post.post_type ?? 'normal'
  let story_info: Post['story_info'] | undefined
  let music_info: Post['music_info'] | undefined
  let video_info: Post['video_info'] | undefined
  if ((postType === 'story' || postType === 'series') && (post.chapter_number != null || post.content_length != null)) {
    story_info = {
      chapter_number: post.chapter_number ?? undefined,
      content_length: post.content_length ?? undefined,
    }
  }
  if (postType === 'music' && post.music_url) {
    music_info = {
      music_url: post.music_url,
      duration_seconds: post.duration_seconds ?? undefined,
      cover_url: post.cover_url ?? null,
    }
  }
  if (postType === 'short_video' && post.video_url) {
    video_info = {
      video_url: post.video_url,
      duration_seconds: post.duration_seconds ?? undefined,
      cover_url: post.cover_url ?? null,
    }
  }

  return {
    ...post,
    post_type: postType,
    story_info,
    music_info,
    video_info,
    like_count: post.like_count ?? 0,
    comment_count: post.comment_count ?? 0,
    share_count: post.share_count ?? 0,
    favorite_count: post.favorite_count ?? 0,
    tip_amount: post.tip_amount ?? 0,
    user: post.user
      ? {
          username: post.user.username || '',
          display_name: post.user.display_name || '',
          avatar_url: post.user.avatar_url,
        }
      : undefined,
    topics: post.topics?.map((pt: any) => pt.topic).filter(Boolean) || [],
    linkedProducts: linkedProducts.length > 0 ? linkedProducts : undefined,
  }
}

export const POSTS_PER_PAGE = 20
