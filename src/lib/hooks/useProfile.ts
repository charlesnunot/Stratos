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
  content_lang?: 'zh' | 'en' | null
  display_name_translated?: string | null
  bio_translated?: string | null
  location_translated?: string | null
  follower_count: number
  following_count: number
  role: string
  subscription_type: string | null
  created_at: string
  status?: string | null // ✅ 修复 P0: 添加 status 字段用于检查用户状态
  email?: string | null // ✅ 修复 P0-3: 自己的页面可以查看 email
  tip_enabled?: boolean | null
  // 资料审核：仅本人查询时返回；他人只看已审核的主字段
  profile_status?: 'pending' | 'approved' | null
  pending_display_name?: string | null
  pending_username?: string | null
  pending_avatar_url?: string | null
  pending_bio?: string | null
  pending_location?: string | null
}

export type ProfileQueryErrorKind =
  | 'network'
  | 'schema_mismatch'
  | 'permission_limited'
  | 'unknown'

export interface ProfileResult {
  profile: Profile | null
  errorKind?: ProfileQueryErrorKind
  rawError?: unknown
}

export function useProfile(userId: string) {
  const { user } = useAuth()
  const isOwnProfile = user?.id === userId

  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async (): Promise<ProfileResult> => {
      const supabase = createClient()
      
      // ✅ 修复 P0-3: 如果是自己的页面，查询完整数据（含 email、待审核字段）
      // 如果是他人页面，只查询已审核的公开字段（不查 pending_*，他人只看已审核资料）
      // profiles 表无 email 列（email 在 auth.users），本人页需 email 时从 useAuth().user.email 取
      const baseSelectFields = isOwnProfile
        ? 'id, username, display_name, avatar_url, bio, location, content_lang, display_name_translated, bio_translated, location_translated, follower_count, following_count, created_at, status, subscription_type, role, tip_enabled, profile_status, pending_display_name, pending_username, pending_avatar_url, pending_bio, pending_location'
        : 'id, username, display_name, avatar_url, bio, location, content_lang, display_name_translated, bio_translated, location_translated, follower_count, following_count, created_at, status'

      // 最小公开字段（用于 400 降级重试）
      const publicSelectFields =
        'id, username, display_name, avatar_url, bio, location, content_lang, display_name_translated, bio_translated, location_translated, follower_count, following_count, created_at'

      const classifyError = (error: any): ProfileQueryErrorKind => {
        if (!error) return 'unknown'
        const message: string = error.message || ''
        const status: number | undefined =
          typeof error.status === 'number' ? error.status : undefined
        const code = error.code

        if (
          message.includes('Failed to fetch') ||
          message.includes('ERR_CONNECTION') ||
          message.includes('TypeError: Failed to fetch')
        ) {
          return 'network'
        }

        if (status === 400 || code === '400') {
          return 'schema_mismatch'
        }

        if (status === 401 || status === 403 || code === '401' || code === '403') {
          return 'permission_limited'
        }

        return 'unknown'
      }

      // 主查询
      const { data, error } = await supabase
        .from('profiles')
        .select(baseSelectFields)
        .eq('id', userId)
        .single()

      if (!error && data) {
        return {
          profile: data as unknown as Profile,
        }
      }

      const errorKind = classifyError(error)

      // 针对 400（字段 / RLS 不兼容）做一次公开字段的降级重试
      if (errorKind === 'schema_mismatch') {
        const { data: publicData, error: publicError } = await supabase
          .from('profiles')
          .select(publicSelectFields)
          .eq('id', userId)
          .single()

        if (!publicError && publicData) {
          return {
            profile: publicData as unknown as Profile,
            errorKind,
            rawError: error,
          }
        }

        return {
          profile: null,
          errorKind,
          rawError: error,
        }
      }

      // 权限或网络等可预期错误：交由上层根据 errorKind 做降级渲染，不在这里抛出泛化异常
      if (errorKind === 'permission_limited' || errorKind === 'network') {
        return {
          profile: null,
          errorKind,
          rawError: error,
        }
      }

      // 其他未知错误：仍然抛出，让 React Query 标记为 error，方便暴露真正配置问题
      console.error('Profile query unexpected error:', error)
      throw error
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
      queryClient.invalidateQueries({ queryKey: ['recommendedForMe'] })
      queryClient.invalidateQueries({ queryKey: ['suggestedUsers'] })
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

/** 某用户的粉丝列表（公开，供个人页 /profile/[id]/followers 使用） */
export function useProfileFollowers(userId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['profileFollowers', userId],
    queryFn: async () => {
      if (!userId) return []
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
        .eq('followee_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []).map((item: any) => ({
        id: item.follower_id,
        username: item.follower?.username ?? '',
        display_name: item.follower?.display_name ?? null,
        avatar_url: item.follower?.avatar_url ?? null,
      }))
    },
    enabled: !!userId,
  })
}

/** 某用户的关注列表（公开，供个人页 /profile/[id]/following 使用） */
export function useProfileFollowing(userId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['profileFollowing', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('follows')
        .select(`
          followee_id,
          followee:profiles!follows_followee_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('follower_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []).map((item: any) => ({
        id: item.followee_id,
        username: item.followee?.username ?? '',
        display_name: item.followee?.display_name ?? null,
        avatar_url: item.followee?.avatar_url ?? null,
      }))
    },
    enabled: !!userId,
  })
}