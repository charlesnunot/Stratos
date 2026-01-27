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
 * 逻辑：你的粉丝也关注了谁 → 这些人你可能认识，排除已关注的
 */
export function useRecommendedForMe(limit = 12) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['recommendedForMe', user?.id, limit],
    queryFn: async (): Promise<PeopleUser[]> => {
      if (!user) return []

      const suggestions: PeopleUser[] = []
      const seen = new Set<string>([user.id])

      // 1. 我的粉丝
      const { data: myFollowers } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('followee_id', user.id)

      const followerIds = (myFollowers || []).map((f: any) => f.follower_id)
      if (followerIds.length === 0) return []

      // 2. 我已关注的人
      const { data: myFollowing } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', user.id)

      const followingIds = new Set((myFollowing || []).map((f: any) => f.followee_id))
      followerIds.forEach((id) => seen.add(id))

      // 3. 粉丝们关注的人（排除我和已关注）
      const { data: fansFollowing } = await supabase
        .from('follows')
        .select(
          `
          followee_id,
          followee:profiles!follows_followee_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `
        )
        .in('follower_id', followerIds)
        .limit(limit * 5)

      const cands = (fansFollowing || []) as any[]
      for (const c of cands) {
        const id = c.followee_id
        if (!id || seen.has(id) || followingIds.has(id) || !c.followee) continue
        seen.add(id)
        suggestions.push({
          id: c.followee.id,
          username: c.followee.username ?? '',
          display_name: c.followee.display_name ?? null,
          avatar_url: c.followee.avatar_url ?? null,
          isMutualFriend: false,
        })
        if (suggestions.length >= limit) break
      }

      return suggestions
    },
    enabled: !!user,
  })
}
