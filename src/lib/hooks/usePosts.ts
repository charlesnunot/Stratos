'use client'

import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface Post {
  id: string
  user_id: string
  content: string | null
  image_urls: string[]
  like_count: number
  comment_count: number
  share_count: number
  repost_count?: number
  favorite_count?: number
  tip_amount: number
  created_at: string
  status?: string
  affiliatePost?: {
    product?: { images?: string[] } & Record<string, unknown>
  }
  user?: {
    username: string
    display_name: string
    avatar_url: string | null
  }
  topics?: Array<{ id: string; name: string; slug: string }>
}

const POSTS_PER_PAGE = 20

async function fetchPosts(page: number = 0, status: string = 'approved') {
  const supabase = createClient()
  
  const from = page * POSTS_PER_PAGE
  const to = from + POSTS_PER_PAGE - 1

  const { data, error } = await supabase
    .from('posts')
    .select(`
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
          slug
        )
      )
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  // Transform the data to match our Post interface
  const posts: Post[] = (data || []).map((post: any) => ({
    ...post,
    // Ensure numeric fields have default values
    like_count: post.like_count ?? 0,
    comment_count: post.comment_count ?? 0,
    share_count: post.share_count ?? 0,
    favorite_count: post.favorite_count ?? 0,
    tip_amount: post.tip_amount ?? 0,
    user: post.user ? {
      username: post.user.username || '',
      display_name: post.user.display_name || '',
      avatar_url: post.user.avatar_url,
    } : undefined,
    topics: post.topics?.map((pt: any) => pt.topic).filter(Boolean) || [],
  }))

  return posts
}

async function fetchUserPosts(userId: string, page: number = 0, status: string | undefined = 'approved') {
  const supabase = createClient()
  
  const from = page * POSTS_PER_PAGE
  const to = from + POSTS_PER_PAGE - 1

  let query = supabase
    .from('posts')
    .select(`
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
          slug
        )
      )
    `)
    .eq('user_id', userId)
  
  // ✅ 修复 P0-2: 如果 status 为 undefined，查询所有状态的帖子（用于自己的页面显示草稿）
  if (status !== undefined) {
    query = query.eq('status', status)
  }
  
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  // Transform the data to match our Post interface
  const posts: Post[] = (data || []).map((post: any) => ({
    ...post,
    // Ensure numeric fields have default values
    like_count: post.like_count ?? 0,
    comment_count: post.comment_count ?? 0,
    share_count: post.share_count ?? 0,
    favorite_count: post.favorite_count ?? 0,
    tip_amount: post.tip_amount ?? 0,
    user: post.user ? {
      username: post.user.username || '',
      display_name: post.user.display_name || '',
      avatar_url: post.user.avatar_url,
    } : undefined,
    topics: post.topics?.map((pt: any) => pt.topic).filter(Boolean) || [],
  }))

  return posts
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
    staleTime: 30_000, // 增加到30秒，减少不必要的重新获取
    refetchOnWindowFocus: false,
    refetchOnMount: false, // 如果数据仍然新鲜，不重新获取
    gcTime: 5 * 60 * 1000, // 5分钟垃圾回收时间（原 cacheTime）
  })
}

export function useUserPosts(userId: string, status: string | undefined = 'approved', options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ['userPosts', userId, status ?? 'all'],
    queryFn: ({ pageParam = 0 }) => fetchUserPosts(userId, pageParam, status),
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

export function usePost(postId: string) {
  return useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('posts')
        .select(`
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
              slug
            )
          )
        `)
        .eq('id', postId)
        .single()

      if (error) throw error

      // Transform the data
      const post: Post = {
        ...data,
        // Ensure numeric fields have default values
        like_count: data.like_count ?? 0,
        comment_count: data.comment_count ?? 0,
        share_count: data.share_count ?? 0,
        favorite_count: data.favorite_count ?? 0,
        tip_amount: data.tip_amount ?? 0,
        user: data.user ? {
          username: data.user.username || '',
          display_name: data.user.display_name || '',
          avatar_url: data.user.avatar_url,
        } : undefined,
        topics: data.topics?.map((pt: any) => pt.topic).filter(Boolean) || [],
      }

      return post
    },
    enabled: !!postId,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })
}

