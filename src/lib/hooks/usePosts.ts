'use client'

import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  type Post,
  type FeedRecommendationReasonType,
  POST_SELECT,
  POSTS_PER_PAGE,
  mapRowToPost,
} from '@/lib/posts/shared'

export type { Post }

/** 个性化 Feed（带推荐理由）：只查询 posts 表 */
async function fetchPersonalizedFeedWithReasons(
  userId: string,
  page: number,
  options?: { followedOnly?: boolean }
): Promise<Post[]> {
  const supabase = createClient()
  const offset = page * POSTS_PER_PAGE

  const { data: rows, error: rpcError } = await supabase.rpc('get_unified_feed_with_reasons', {
    p_user_id: userId,
    p_limit: POSTS_PER_PAGE,
    p_offset: offset,
    p_followed_only: options?.followedOnly ?? false,
    p_exclude_viewed_days: 7,
    p_tier1_base: 100,
    p_tier2_base: 50,
    p_diversity_n: 20,
    p_diversity_k: 2,
  })

  if (rpcError) throw rpcError
  const items = (rows || []) as { item_id: string; item_type: string; reason_type: string | null }[]
  
  // 只查询 posts 表（带货帖子已同步到 posts）
  const postIds = items.filter(i => i.item_type === 'post').map(i => i.item_id)
  
  if (postIds.length === 0) return []

  // 查询 posts 表
  const { data: postsData, error: postsError } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .in('id', postIds)

  if (postsError) throw postsError

  // 转换数据
  const posts = (postsData || []).map((p: any) => mapRowToPost(p))
  
  // 按原始顺序排序
  const byId = new Map(posts.map(p => [p.id, p]))
  
  return items.map((item) => {
    const post = byId.get(item.item_id)
    if (!post) return null
    const reasonType = (item.reason_type ?? 'trending') as FeedRecommendationReasonType
    return { ...post, recommendationReason: { reasonType } }
  }).filter(Boolean) as Post[]
}

async function fetchPosts(page: number = 0, status: string = 'approved') {
  const supabase = createClient()
  
  const from = page * POSTS_PER_PAGE
  const to = from + POSTS_PER_PAGE - 1

  // 只查询 posts 表（带货帖子已同步到 posts）
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return (data || []).map((p: any) => mapRowToPost(p))
}

async function fetchUserPosts(
  userId: string,
  page: number = 0,
  status: string | undefined = 'approved',
  postType?: string
) {
  const supabase = createClient()
  const from = page * POSTS_PER_PAGE
  const to = from + POSTS_PER_PAGE - 1

  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('user_id', userId)

  if (status !== undefined) {
    query = query.eq('status', status)
  }
  if (postType) {
    if (postType === 'normal') {
      query = query.in('post_type', ['normal', 'image', 'text'])
    } else {
      query = query.eq('post_type', postType)
    }
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return (data || []).map(mapRowToPost)
}

/** 按话题拉取已审核帖子（分页），用于话题页。可选按 post_type 筛选。 */
async function fetchTopicPosts(topicId: string, page: number = 0, postType?: string): Promise<Post[]> {
  const supabase = createClient()
  const from = page * POSTS_PER_PAGE
  const to = from + POSTS_PER_PAGE - 1

  let query = supabase
    .from('posts')
    .select(
      `
      *,
      user:profiles!posts_user_id_fkey (
        username,
        display_name,
        avatar_url
      ),
      topics:post_topics!inner (
        topic:topics (
          id,
          name,
          slug,
          name_translated,
          name_lang
        )
      )
      `
    )
    .eq('status', 'approved')
    .eq('topics.topic_id', topicId)

  if (postType) {
    if (postType === 'normal') {
      query = query.in('post_type', ['normal', 'image', 'text'])
    } else {
      query = query.eq('post_type', postType)
    }
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return (data || []).map((p: any) => mapRowToPost({ ...p, topics: p.topics?.map((pt: any) => pt.topic).filter(Boolean) || [] }))
}

/** 仅拉取 short_video 帖子（分页），按时间倒序。用于视频流。 */
async function fetchShortVideoPosts(page: number = 0, limit: number = POSTS_PER_PAGE): Promise<Post[]> {
  const supabase = createClient()
  const from = page * limit
  const to = from + limit - 1
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('status', 'approved')
    .eq('post_type', 'short_video')
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw error
  return (data || []).map(mapRowToPost)
}

/** 以某帖为起点，拉取其前后各 N 条 short_video，用于视频流首屏。返回有序列表与当前帖下标。 */
export async function fetchShortVideoAroundPost(
  postId: string,
  beforeCount: number = 10,
  afterCount: number = 10
): Promise<{ posts: Post[]; currentIndex: number }> {
  const supabase = createClient()
  const { data: row, error: rowError } = await supabase
    .from('posts')
    .select('id, created_at')
    .eq('id', postId)
    .eq('status', 'approved')
    .eq('post_type', 'short_video')
    .single()
  if (rowError || !row) throw new Error('Post not found or not a short_video')
  const createdAt = row.created_at as string

  const [olderRes, newerRes] = await Promise.all([
    supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('status', 'approved')
      .eq('post_type', 'short_video')
      .lt('created_at', createdAt)
      .order('created_at', { ascending: false })
      .limit(beforeCount),
    supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('status', 'approved')
      .eq('post_type', 'short_video')
      .gt('created_at', createdAt)
      .order('created_at', { ascending: true })
      .limit(afterCount),
  ])
  if (olderRes.error) throw olderRes.error
  if (newerRes.error) throw newerRes.error
  const older = (olderRes.data || []).map(mapRowToPost)
  const newer = (newerRes.data || []).map(mapRowToPost).reverse()
  const { data: currentRow, error: currentErr } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .single()
  if (currentErr || !currentRow) throw new Error('Post not found')
  const currentPost = mapRowToPost(currentRow)
  const posts = [...older, currentPost, ...newer]
  const currentIndex = older.length
  return { posts, currentIndex }
}

/** 拉取比某时间更早的 short_video（用于视频流向下滑动加载更多）。 */
export async function fetchShortVideoOlderThan(createdAt: string, limit: number = POSTS_PER_PAGE): Promise<Post[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('status', 'approved')
    .eq('post_type', 'short_video')
    .lt('created_at', createdAt)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map(mapRowToPost)
}

/** 拉取比某时间更新的 short_video（用于视频流向上滑动加载更多）。 */
export async function fetchShortVideoNewerThan(createdAt: string, limit: number = POSTS_PER_PAGE): Promise<Post[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('status', 'approved')
    .eq('post_type', 'short_video')
    .gt('created_at', createdAt)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data || []).map(mapRowToPost).reverse()
}

/** 按小组拉取已审核帖子（分页），用于小组详情页。可选按 post_type 筛选。 */
async function fetchGroupPosts(groupId: string, page: number = 0, postType?: string): Promise<Post[]> {
  const supabase = createClient()
  const from = page * POSTS_PER_PAGE
  const to = from + POSTS_PER_PAGE - 1

  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('group_id', groupId)
    .eq('status', 'approved')

  if (postType) {
    if (postType === 'normal') {
      query = query.in('post_type', ['normal', 'image', 'text'])
    } else {
      query = query.eq('post_type', postType)
    }
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return (data || []).map(mapRowToPost)
}

/** 个性化推荐 Feed（登录用户，带推荐理由）；Following 页传 followedOnly: true */
export function useFeed(
  userId: string | undefined,
  options?: {
    followedOnly?: boolean
    enabled?: boolean
  }
) {
  return useInfiniteQuery({
    queryKey: ['feed', userId, options?.followedOnly ?? false],
    queryFn: ({ pageParam = 0 }) =>
      fetchPersonalizedFeedWithReasons(userId!, pageParam, { followedOnly: options?.followedOnly }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < POSTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: (options?.enabled !== false) && !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    gcTime: 5 * 60 * 1000,
  })
}

const IMPRESSION_DEBOUNCE_MS = 800
const IMPRESSION_BATCH_MAX = 50
const pendingByUser = new Map<string, Set<string>>()
let impressionFlushTimer: ReturnType<typeof setTimeout> | null = null

function flushFeedImpressions() {
  impressionFlushTimer = null
  if (pendingByUser.size === 0) return
  const rows: { user_id: string; post_id: string; shown_at: string }[] = []
  const now = new Date().toISOString()
  for (const [userId, ids] of pendingByUser) {
    for (const postId of ids) {
      rows.push({ user_id: userId, post_id: postId, shown_at: now })
      if (rows.length >= IMPRESSION_BATCH_MAX) break
    }
    if (rows.length >= IMPRESSION_BATCH_MAX) break
  }
  if (rows.length === 0) return
  const supabase = createClient()
  supabase.from('feed_impressions').insert(rows).then(() => {
    for (const r of rows) {
      pendingByUser.get(r.user_id)?.delete(r.post_id)
      if (pendingByUser.get(r.user_id)?.size === 0) pendingByUser.delete(r.user_id)
    }
    if (pendingByUser.size > 0) impressionFlushTimer = setTimeout(flushFeedImpressions, IMPRESSION_DEBOUNCE_MS)
  })
}

/** 写入 Feed 曝光（防抖 + 批量）；可选在展示时调用 */
export function recordFeedImpressions(userId: string, postIds: string[]): void {
  if (postIds.length === 0) return
  let set = pendingByUser.get(userId)
  if (!set) {
    set = new Set()
    pendingByUser.set(userId, set)
  }
  postIds.forEach((id) => set!.add(id))
  if (!impressionFlushTimer) {
    impressionFlushTimer = setTimeout(flushFeedImpressions, IMPRESSION_DEBOUNCE_MS)
  }
  if (set.size >= IMPRESSION_BATCH_MAX) {
    if (impressionFlushTimer) clearTimeout(impressionFlushTimer)
    impressionFlushTimer = null
    flushFeedImpressions()
  }
}

export function usePosts(
  status: string = 'approved',
  options?: {
    enabled?: boolean
    initialData?: { pages: Post[][]; pageParams: number[] }
  }
) {
  return useInfiniteQuery({
    queryKey: ['posts', status],
    queryFn: ({ pageParam = 0 }) => fetchPosts(pageParam, status),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < POSTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: options?.enabled !== false, // 默认启用
    initialData: options?.initialData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // 如果数据仍然新鲜，不重新获取
    gcTime: 5 * 60 * 1000, // 5分钟垃圾回收时间（原 cacheTime）
  })
}

export function useUserPosts(
  userId: string,
  status: string | undefined = 'approved',
  options?: { enabled?: boolean; postType?: string }
) {
  return useInfiniteQuery({
    queryKey: ['userPosts', userId, status ?? 'all', options?.postType],
    queryFn: ({ pageParam = 0 }) =>
      fetchUserPosts(userId, pageParam, status, options?.postType),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < POSTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: (options?.enabled !== false) && !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    gcTime: 5 * 60 * 1000,
  })
}

/** 话题页：按话题 ID 分页拉取已审核帖子，可选按 post_type 筛选 */
export function useTopicPosts(
  topicId: string | undefined,
  options?: { enabled?: boolean; postType?: string }
) {
  return useInfiniteQuery({
    queryKey: ['topicPosts', topicId, options?.postType],
    queryFn: ({ pageParam = 0 }) =>
      fetchTopicPosts(topicId!, pageParam, options?.postType),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < POSTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: (options?.enabled !== false) && !!topicId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    gcTime: 5 * 60 * 1000,
  })
}

/** 小组页：按小组 ID 分页拉取已审核帖子，可选按 post_type 筛选 */
export function useGroupPosts(
  groupId: string | undefined,
  options?: { enabled?: boolean; postType?: string }
) {
  return useInfiniteQuery({
    queryKey: ['groupPosts', groupId, options?.postType],
    queryFn: ({ pageParam = 0 }) =>
      fetchGroupPosts(groupId!, pageParam, options?.postType),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < POSTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: (options?.enabled !== false) && !!groupId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    gcTime: 5 * 60 * 1000,
  })
}

export function usePost(postId: string) {
  return useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      const supabase = createClient()
      
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('id', postId)
        .single()

      if (postError) throw postError
      if (!postData) throw new Error('Post not found')
      
      return mapRowToPost(postData)
    },
    enabled: !!postId,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })
}

/** 视频流：以某 short_video 为起点的列表与下标；并提供 fetchOlder / fetchNewer 用于加载更多。 */
export function useVideoStream(postId: string | undefined) {
  const query = useQuery({
    queryKey: ['videoStream', postId],
    queryFn: () => fetchShortVideoAroundPost(postId!, 10, 10),
    enabled: !!postId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  return {
    ...query,
    fetchOlder: fetchShortVideoOlderThan,
    fetchNewer: fetchShortVideoNewerThan,
  }
}


