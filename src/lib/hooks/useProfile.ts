'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  follower_count: number
  following_count: number
  role: string
  subscription_type: string | null
  created_at: string
}

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Profile query error:', error)
        throw error
      }
      
      if (!data) {
        console.error('Profile not found for userId:', userId)
        throw new Error('Profile not found')
      }
      
      return data as Profile
    },
    enabled: !!userId,
    retry: 1,
  })
}

export function useIsFollowing(followingId: string) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['isFollowing', user?.id, followingId],
    queryFn: async () => {
      if (!user) return false
      const { data, error } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', user.id)
        .eq('followee_id', followingId)
        .limit(1)
      
      if (error) throw error
      return data && data.length > 0
    },
    enabled: !!user && !!followingId && user.id !== followingId,
  })
}

export function useFollow() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      followingId, 
      shouldFollow
    }: { 
      followingId: string
      shouldFollow: boolean
    }) => {
      if (!user) throw new Error('Not authenticated')
      if (user.id === followingId) throw new Error('Cannot follow yourself')

      if (shouldFollow) {
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: user.id,
            followee_id: followingId,
          })
        
        // 如果是唯一约束冲突（记录已存在），忽略错误
        if (error && error.code !== '23505') {
          throw error
        }
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('followee_id', followingId)
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['profile', variables.followingId] })
      queryClient.invalidateQueries({ queryKey: ['isFollowing', user?.id, variables.followingId] })
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }) // Update current user's following count
    },
  })
}

/**
 * 获取当前用户关注的人列表（带用户信息）
 */
export function useFollowing() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['followingUsers', user?.id],
    queryFn: async () => {
      if (!user) return []
      
      const { data, error } = await supabase
        .from('follows')
        .select(`
          followee_id,
          following:profiles!follows_followee_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('follower_id', user.id)

      if (error) throw error
      
      return (data || []).map((item: any) => ({
        id: item.followee_id,
        username: item.following?.username || '',
        display_name: item.following?.display_name || '',
        avatar_url: item.following?.avatar_url || null,
      }))
    },
    enabled: !!user,
  })
}

/**
 * 获取当前用户的粉丝列表（带用户信息）
 */
export function useFollowers() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['followers', user?.id],
    queryFn: async () => {
      if (!user) return []
      
      const { data, error } = await supabase
        .from('follows')
        .select(`
          follower_id,
          follower:profiles!follows_follower_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('followee_id', user.id)

      if (error) throw error
      
      return (data || []).map((item: any) => ({
        id: item.follower_id,
        username: item.follower?.username || '',
        display_name: item.follower?.display_name || '',
        avatar_url: item.follower?.avatar_url || null,
      }))
    },
    enabled: !!user,
  })
}

