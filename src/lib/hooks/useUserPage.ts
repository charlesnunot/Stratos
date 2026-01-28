'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'
import { useProfile, type ProfileResult, type Profile } from './useProfile'

export type UserPageStatus = 'loading' | 'unavailable' | 'ready'

export type UserPageUnavailableReason =
  | 'network'
  | 'not_found'
  | 'suspended'
  | 'permission'

export type UserRelationship =
  | 'self'
  | 'following' // viewer 关注了 target
  | 'followed_by' // target 关注了 viewer
  | 'mutual_follow' // 互相关注
  | 'blocked_by_viewer' // viewer 拉黑 target
  | 'blocked_by_target' // target 拉黑 viewer
  | 'none'

export interface UserPageCapabilities {
  canViewProfile: boolean
  canViewPrivateInfo: boolean
  canEditProfile: boolean
  canViewPosts: boolean
  canViewFollowers: boolean
  canFollow: boolean
  canBlock: boolean
  canChat: boolean
  canTip: boolean
}

export interface UserPageState {
  status: UserPageStatus
  unavailableReason?: UserPageUnavailableReason
  viewer: { id: string } | null
  targetUser: Profile | null
  relationship: UserRelationship
  capabilities: UserPageCapabilities
  profileErrorKind?: ProfileResult['errorKind']
}

interface RelationshipFacts {
  isFollowing: boolean
  isFollowedBy: boolean
  blockedByViewer: boolean
  blockedByTarget: boolean
}

function deriveRelationship(
  viewerId: string | null,
  targetUserId: string | null,
  facts: RelationshipFacts
): UserRelationship {
  if (!viewerId || !targetUserId || viewerId === targetUserId) {
    return viewerId && targetUserId && viewerId === targetUserId ? 'self' : 'none'
  }

  if (facts.blockedByViewer) return 'blocked_by_viewer'
  if (facts.blockedByTarget) return 'blocked_by_target'

  const { isFollowing, isFollowedBy } = facts

  if (isFollowing && isFollowedBy) return 'mutual_follow'
  if (isFollowing) return 'following'
  if (isFollowedBy) return 'followed_by'

  return 'none'
}

function computeCapabilities(params: {
  viewerId: string | null
  targetUser: Profile | null
  relationship: UserRelationship
}): UserPageCapabilities {
  const { viewerId, targetUser, relationship } = params

  const isSelf = !!viewerId && !!targetUser && viewerId === targetUser.id
  const isSuspended = targetUser?.status === 'suspended' || targetUser?.status === 'banned'
  const blockedByTarget = relationship === 'blocked_by_target'

  // 基本可见性
  const canViewProfile = !!targetUser && !blockedByTarget

  // 私有信息（邮箱、订单等）仅自己或未来可扩展到特定关系
  const canViewPrivateInfo = isSelf

  // 主页内容（帖子、商品等），被对方拉黑或账号封禁时关闭
  const canViewPosts = !!targetUser && !blockedByTarget && !isSuspended

  const canViewFollowers = !!targetUser && !blockedByTarget

  const canEditProfile = isSelf && !isSuspended

  const canFollow =
    !!viewerId &&
    !!targetUser &&
    !isSelf &&
    !isSuspended &&
    relationship !== 'blocked_by_viewer' &&
    relationship !== 'blocked_by_target'

  const canBlock = !!viewerId && !!targetUser && !isSelf

  const canChat =
    !!viewerId &&
    !!targetUser &&
    !isSelf &&
    !isSuspended &&
    relationship !== 'blocked_by_viewer' &&
    relationship !== 'blocked_by_target'

  // 简化版：未来可基于 tip_enabled / 订阅能力继续细化
  const canTip =
    !!viewerId &&
    !!targetUser &&
    !isSelf &&
    !isSuspended &&
    relationship !== 'blocked_by_viewer' &&
    relationship !== 'blocked_by_target'

  return {
    canViewProfile,
    canViewPrivateInfo,
    canEditProfile,
    canViewPosts,
    canViewFollowers,
    canFollow,
    canBlock,
    canChat,
    canTip,
  }
}

export function useUserPage(userId: string): UserPageState {
  const { user: viewer } = useAuth()
  const viewerId = viewer?.id ?? null

  // 复用已有的 profile 查询逻辑（包含 errorKind、status 等）
  const {
    data: profileResult,
    isLoading: profileLoading,
    error: profileError,
  } = useProfile(userId)

  const targetUser = profileResult?.profile ?? null
  const profileErrorKind = profileResult?.errorKind

  const supabase = useMemo(() => createClient(), [])

  // 只在 viewer 存在且不是自己时查询关系
  const {
    data: relationshipFacts = {
      isFollowing: false,
      isFollowedBy: false,
      blockedByViewer: false,
      blockedByTarget: false,
    },
  } = useQuery<RelationshipFacts>({
    queryKey: ['userRelationship', viewerId, userId],
    enabled: !!viewerId && !!userId && viewerId !== userId,
    queryFn: async () => {
      if (!viewerId || !userId || viewerId === userId) {
        return {
          isFollowing: false,
          isFollowedBy: false,
          blockedByViewer: false,
          blockedByTarget: false,
        }
      }

      const [followRes, followBackRes, blockViewerRes, blockTargetRes] = await Promise.all([
        supabase
          .from('follows')
          .select('id')
          .eq('follower_id', viewerId)
          .eq('followee_id', userId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('follows')
          .select('id')
          .eq('follower_id', userId)
          .eq('followee_id', viewerId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', viewerId)
          .eq('blocked_id', userId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', userId)
          .eq('blocked_id', viewerId)
          .limit(1)
          .maybeSingle(),
      ])

      return {
        isFollowing: !!followRes.data,
        isFollowedBy: !!followBackRes.data,
        blockedByViewer: !!blockViewerRes.data,
        blockedByTarget: !!blockTargetRes.data,
      }
    },
  })

  const relationship = deriveRelationship(viewerId, targetUser?.id ?? userId, relationshipFacts)

  // 页面级 status / unavailableReason 计算
  let status: UserPageStatus = 'ready'
  let unavailableReason: UserPageUnavailableReason | undefined

  if (profileLoading) {
    status = 'loading'
  } else if (relationship === 'blocked_by_target') {
    status = 'unavailable'
    unavailableReason = 'permission'
  } else if (!targetUser) {
    status = 'unavailable'
    if (profileErrorKind === 'network') {
      unavailableReason = 'network'
    } else if (profileErrorKind === 'permission_limited') {
      unavailableReason = 'permission'
    } else {
      unavailableReason = 'not_found'
    }
  } else if (targetUser.status === 'banned' || targetUser.status === 'suspended') {
    status = 'unavailable'
    unavailableReason = 'suspended'
  } else if (profileError && !profileErrorKind) {
    // 真正的异常仍然视为网络级问题
    status = 'unavailable'
    unavailableReason = 'network'
  } else {
    status = 'ready'
  }

  const capabilities = computeCapabilities({
    viewerId,
    targetUser,
    relationship,
  })

  return {
    status,
    unavailableReason,
    viewer: viewerId ? { id: viewerId } : null,
    targetUser,
    relationship,
    capabilities,
    profileErrorKind,
  }
}

