'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { usePost } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { useRecordView } from '@/lib/hooks/useViewHistory'
import type {
  PostPageState,
  PageCapabilities,
  UnavailableReason,
  AuthorizationToken,
} from '@/lib/post-detail/types'

function classifyUnavailableReason(error: unknown): UnavailableReason {
  const message = (error as any)?.message ? String((error as any).message) : ''

  if (message.includes('not found') || message.includes('不存在')) {
    return 'deleted'
  }

  if (message.includes('permission') || message.includes('权限')) {
    return 'permission'
  }

  if (
    message.includes('network') ||
    message.includes('网络') ||
    message.includes('Failed to fetch') ||
    message.includes('ERR_CONNECTION')
  ) {
    return 'network'
  }

  return 'network'
}

export function usePostPage(postId: string): PostPageState {
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()

  const {
    data: post,
    isLoading,
    error,
  } = usePost(postId)

  // 作者信息
  const authorId = post?.user_id ?? ''
  const { data: authorResult } = useProfile(authorId)
  const author = authorResult ?? null

  // 当前用户 Profile（用于账号状态判断）
  const { data: currentUserProfileResult } = useProfile(user?.id ?? '')
  const currentUserProfile = currentUserProfileResult ?? null

  const isAuthorBannedOrSuspended =
    author?.status === 'banned' || author?.status === 'suspended'

  const isCurrentUserBannedOrSuspended =
    currentUserProfile?.status === 'banned' ||
    currentUserProfile?.status === 'suspended'

  // 是否被作者拉黑（author -> current user）
  const { data: isBlockedByAuthor = false } = useQuery({
    queryKey: ['isBlockedByAuthor', user?.id, authorId],
    queryFn: async () => {
      if (!user || !authorId || user.id === authorId) return false

      const { data, error } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', authorId)
        .eq('blocked_id', user.id)
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return !!data
    },
    enabled: !!user && !!authorId && user?.id !== authorId,
  })

  // MCRE: 获取作者 Monetization Token
  const { data: authTokenData } = useQuery({
    queryKey: ['monetizationToken', authorId],
    queryFn: async () => {
      if (!authorId) return { hasValidToken: false, monetizationToken: null, resolutionId: null, expiresAt: null }
      
      const response = await fetch(`/api/users/${authorId}/monetization-token`)
      if (!response.ok) {
        return { hasValidToken: false, monetizationToken: null, resolutionId: null, expiresAt: null }
      }
      return response.json()
    },
    enabled: !!authorId,
  })

  // 浏览记录：必须在所有条件 return 之前调用，遵守 Hooks 规则
  const recordViewMutation = useRecordView()
  const hasRecordedRef = useRef(false)
  const canRecordView = !!user && post?.status === 'approved'

  useEffect(() => {
    if (
      !hasRecordedRef.current &&
      canRecordView &&
      post?.id &&
      user?.id
    ) {
      hasRecordedRef.current = true
      recordViewMutation.mutate(
        {
          itemType: 'post',
          itemId: post.id,
        },
        {
          onError: () => {},
        },
      )
    }
  }, [
    canRecordView,
    post?.id,
    user?.id,
    recordViewMutation,
  ])

  // loading 分支
  if (isLoading) {
    return { status: 'loading' }
  }

  // 不可用分支
  if (error || !post) {
    const reason = classifyUnavailableReason(error)
    return {
      status: 'unavailable',
      reason,
    }
  }

  // 非 approved 帖子：仅作者或管理员/支持可查看，其他用户视为不可用（避免下架后直链仍可见）
  const isAuthor = !!user && user.id === post.user_id
  const isAdminOrSupport =
    currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'support'
  if (post.status !== 'approved' && !isAuthor && !isAdminOrSupport) {
    return {
      status: 'unavailable',
      reason: 'permission',
    }
  }

  // 统一能力计算
  const isApproved = post.status === 'approved'
  const isLoggedIn = !!user

  // 检查帖子是否允许打赏
  const postTipEnabled = (post as { tip_enabled?: boolean }).tip_enabled !== false

  // MCRE: canTip 基于帖子打赏开关判断
  // 注意：Token 验证在后端 create-tip-session 进行
  // 如果帖子开启打赏，显示按钮（即使作者没有绑定收款账户，点击时后端会验证失败）
  const canTip =
    isLoggedIn &&
    user!.id !== post.user_id &&
    !isBlockedByAuthor &&
    !isCurrentUserBannedOrSuspended &&
    postTipEnabled

  const tipDisabledReason = !canTip
    ? !isLoggedIn
      ? '请先登录'
      : user!.id === post.user_id
        ? '不能给自己打赏'
        : isBlockedByAuthor
          ? '您已被作者拉黑'
          : isCurrentUserBannedOrSuspended
            ? '您的账号状态异常'
            : !postTipEnabled
              ? '该帖子已关闭打赏'
              : !authTokenData?.hasValidToken
                ? '作者当前无法接收打赏（授权已过期或被撤销）'
                : '打赏暂不可用'
    : undefined

  const capabilities: PageCapabilities = {
    canComment:
      isLoggedIn &&
      isApproved &&
      !isBlockedByAuthor &&
      !isCurrentUserBannedOrSuspended,
    canLike:
      isLoggedIn &&
      isApproved &&
      !isBlockedByAuthor &&
      !isCurrentUserBannedOrSuspended,
    canTip,
    canRepost:
      isLoggedIn &&
      isApproved &&
      !isBlockedByAuthor &&
      !isCurrentUserBannedOrSuspended,
    canReport:
      isLoggedIn &&
      user!.id !== post.user_id &&
      !isCurrentUserBannedOrSuspended,
    canFollowAuthor:
      isLoggedIn &&
      user!.id !== post.user_id &&
      !isBlockedByAuthor &&
      !isAuthorBannedOrSuspended &&
      !isCurrentUserBannedOrSuspended,
    canChat:
      isLoggedIn &&
      user!.id !== post.user_id &&
      !isBlockedByAuthor &&
      !isAuthorBannedOrSuspended &&
      !isCurrentUserBannedOrSuspended,
    canViewAuthorPrivateInfo: isLoggedIn && !isBlockedByAuthor,
    canRecordView: isLoggedIn && isApproved,
  }

  return {
    status: 'ready',
    capabilities,
    post,
    user: user ?? null,
    author,
    isBlockedByAuthor,
    isAuthorBannedOrSuspended,
    tipDisabledReason,
    authorizationToken: {
      hasValidToken: authTokenData?.hasValidToken ?? false,
      token: authTokenData?.monetizationToken ?? null,
      resolutionId: authTokenData?.resolutionId ?? null,
      expiresAt: authTokenData?.expiresAt ?? null,
    },
  }
}

