'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

export interface PeopleUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  created_at?: string
  isMutualFriend?: boolean
}

/**
 * 获取近期新增粉丝列表（按关注时间倒序）
 * 用于个人主页「推荐与粉丝」页的「新增粉丝」区块
 */
export function useNewFollowers(userId: string, limit = 30) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['newFollowers', userId, limit],
    queryFn: async (): Promise<PeopleUser[]> => {
      const { data, error } = await supabase
        .from('follows')
        .select(
          `
          created_at,
          follower_id,
          follower:profiles!follows_follower_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `
        )
        .eq('followee_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      return (data || []).map((item: any) => ({
        id: item.follower_id,
        username: item.follower?.username ?? '',
        display_name: item.follower?.display_name ?? null,
        avatar_url: item.follower?.avatar_url ?? null,
        created_at: item.created_at,
      }))
    },
    enabled: !!userId && !!user && user.id === userId,
  })
}

/**
 * 获取「推荐朋友」列表（仅用于当前用户自己）
 * 逻辑由 RPC recommend_friends 实现：你的粉丝也关注的人 + 冷启动时活跃用户补足
 */
export function useRecommendedForMe(limit = 12) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['recommendedForMe', user?.id, limit],
    queryFn: async (): Promise<PeopleUser[]> => {
      if (!user) return []

      const { data: rows, error } = await supabase.rpc('recommend_friends', {
        p_limit: limit,
        p_cursor: undefined,
      })

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[usePeople] recommend_friends RPC failed:', error.message)
        }
        return []
      }

      return (rows || []).map((r: { id: string; username: string | null; display_name: string | null; avatar_url: string | null }) => ({
        id: r.id,
        username: r.username ?? '',
        display_name: r.display_name ?? null,
        avatar_url: r.avatar_url ?? null,
        isMutualFriend: false,
      }))
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}
