'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

interface SuggestedUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  follower_count: number
  following_count: number
  isMutualFriend?: boolean
}

/**
 * 获取"你可能感兴趣的人"列表
 * 包括：
 * 1. 共同朋友（mutual friends）- 当前用户和页面主人都关注的人
 * 2. 可能认识的人 - 页面主人的关注者，但当前用户还没有关注的人
 */
export function useSuggestedUsers(profileUserId: string, limit: number = 6) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['suggestedUsers', user?.id, profileUserId, limit],
    queryFn: async (): Promise<SuggestedUser[]> => {
      if (!user || user.id === profileUserId) {
        return []
      }

      const suggestions: SuggestedUser[] = []

      // 1. 查找共同朋友（mutual friends）
      // 先获取页面主人关注的人
      const { data: profileFollowing } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', profileUserId)

      if (!profileFollowing || profileFollowing.length === 0) {
        // 如果页面主人没有关注任何人，直接查找可能认识的人
      } else {
        const profileFollowingIds = profileFollowing.map((f: any) => f.followee_id)
        
        // 找到当前用户也关注的人（共同朋友）
        const { data: mutualFriends, error: mutualError } = await supabase
          .from('follows')
          .select(`
            followee_id,
            followee:profiles!follows_followee_id_fkey (
              id,
              username,
              display_name,
              avatar_url,
              follower_count,
              following_count
            )
          `)
          .eq('follower_id', user.id)
          .in('followee_id', profileFollowingIds)
          .limit(limit)

        if (!mutualError && mutualFriends) {
          mutualFriends.forEach((item: any) => {
            if (item.followee && item.followee.id !== user.id && item.followee.id !== profileUserId) {
              suggestions.push({
                id: item.followee.id,
                username: item.followee.username,
                display_name: item.followee.display_name,
                avatar_url: item.followee.avatar_url,
                follower_count: item.followee.follower_count || 0,
                following_count: item.followee.following_count || 0,
                isMutualFriend: true,
              })
            }
          })
        }
      }

      if (!mutualError && mutualFriends) {
        mutualFriends.forEach((item: any) => {
          if (item.followee && item.followee.id !== user.id && item.followee.id !== profileUserId) {
            suggestions.push({
              id: item.followee.id,
              username: item.followee.username,
              display_name: item.followee.display_name,
              avatar_url: item.followee.avatar_url,
              follower_count: item.followee.follower_count || 0,
              following_count: item.followee.following_count || 0,
              isMutualFriend: true,
            })
          }
        })
      }

      // 2. 查找可能认识的人 - 页面主人的关注者，但当前用户还没有关注
      // 如果共同朋友数量不足，补充可能认识的人
      const remainingSlots = limit - suggestions.length
      if (remainingSlots > 0) {
        // 获取当前用户已关注的人
        const { data: currentUserFollowing } = await supabase
          .from('follows')
          .select('followee_id')
          .eq('follower_id', user.id)

        const followingIds = new Set(
          (currentUserFollowing || []).map((f: any) => f.followee_id)
        )

        // 获取页面主人的关注者
        const { data: profileFollowers, error: followersError } = await supabase
          .from('follows')
          .select(`
            follower_id,
            follower:profiles!follows_follower_id_fkey (
              id,
              username,
              display_name,
              avatar_url,
              follower_count,
              following_count
            )
          `)
          .eq('followee_id', profileUserId)
          .limit(remainingSlots * 3) // 获取更多，因为需要过滤

        if (!followersError && profileFollowers) {
          // 过滤出当前用户还没有关注的人
          profileFollowers.forEach((item: any) => {
            if (
              suggestions.length < limit &&
              item.follower &&
              item.follower.id !== user.id &&
              item.follower.id !== profileUserId &&
              !followingIds.has(item.follower.id) &&
              !suggestions.find((s) => s.id === item.follower.id)
            ) {
              suggestions.push({
                id: item.follower.id,
                username: item.follower.username,
                display_name: item.follower.display_name,
                avatar_url: item.follower.avatar_url,
                follower_count: item.follower.follower_count || 0,
                following_count: item.follower.following_count || 0,
                isMutualFriend: false,
              })
            }
          })
        }
      }

      // 去重并限制数量
      const uniqueSuggestions = Array.from(
        new Map(suggestions.map((s) => [s.id, s])).values()
      ).slice(0, limit)

      return uniqueSuggestions
    },
    enabled: !!user && !!profileUserId && user.id !== profileUserId,
  })
}
