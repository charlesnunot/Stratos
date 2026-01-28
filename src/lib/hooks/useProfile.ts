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
  status?: string | null // ✅ 修复 P0: 添加 status 字段用于检查用户状态
  email?: string | null // ✅ 修复 P0-3: 自己的页面可以查看 email
  tip_enabled?: boolean | null
}

export function useProfile(userId: string) {
  const { user } = useAuth()
  const isOwnProfile = user?.id === userId

  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const supabase = createClient()
      
      // ✅ 修复 P0-3: 如果是自己的页面，查询完整数据（包括 email 等）
      // 如果是他人页面，只查询公开字段
      const selectFields = isOwnProfile
        ? 'id, username, display_name, avatar_url, bio, location, follower_count, following_count, created_at, status, email, subscription_type, role, tip_enabled'
        : 'id, username, display_name, avatar_url, bio, location, follower_count, following_count, created_at, status'
      
      const { data, error } = await supabase
        .from('profiles')
        .select(selectFields)
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

      return data as unknown as Profile
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

      // ✅ 修复 P1: 检查目标用户状态 - 不能关注被封禁/暂停的用户
      if (shouldFollow) {
        const { data: targetProfile } = await supabase
          .from('profiles')
          .select('status')
          .eq('id', followingId)
          .single()

        if (targetProfile?.status === 'banned' || targetProfile?.status === 'suspended') {
          throw new Error('Cannot follow banned or suspended user')
        }

        // ✅ 修复 P1: 检查黑名单 - 如果被拉黑，不能关注
        const { data: blocked } = await supabase
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', followingId)
          .eq('blocked_id', user.id)
          .limit(1)
          .maybeSingle()

        if (blocked) {
          throw new Error('You have been blocked by this user')
        }
      }

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

