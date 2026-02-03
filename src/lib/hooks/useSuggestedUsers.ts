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

/** RPC 返回单行类型 */
interface SuggestedUserRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  follower_count: number
  following_count: number
  is_mutual_friend: boolean
}

/**
 * 获取"你可能感兴趣的人"列表
 * 逻辑由 RPC suggested_users 实现：共同关注 + 页面主人粉丝，不足时活跃用户补足
 */
export function useSuggestedUsers(profileUserId: string, limit: number = 6) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['suggestedUsers', user?.id, profileUserId, limit],
    queryFn: async (): Promise<SuggestedUser[]> => {
      if (!user || user.id === profileUserId) return []

      const { data: rows, error } = await supabase.rpc('suggested_users', {
        p_profile_user_id: profileUserId,
        p_limit: limit,
        p_cursor: undefined,
      })

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[useSuggestedUsers] suggested_users RPC failed:', error.message)
        }
        return []
      }

      return (rows || []).map((r: SuggestedUserRow) => ({
        id: r.id,
        username: r.username ?? '',
        display_name: r.display_name ?? null,
        avatar_url: r.avatar_url ?? null,
        follower_count: r.follower_count ?? 0,
        following_count: r.following_count ?? 0,
        isMutualFriend: r.is_mutual_friend ?? false,
      }))
    },
    enabled: !!user && !!profileUserId && user.id !== profileUserId,
    staleTime: 5 * 60 * 1000,
  })
}
