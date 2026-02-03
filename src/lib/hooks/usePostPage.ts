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
  const author = authorResult?.profile ?? null

  // 当前用户 Profile（用于账号状态判断）
  const { data: currentUserProfileResult } = useProfile(user?.id ?? '')
  const currentUserProfile = currentUserProfileResult?.profile ?? null

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

  const canTip =
    isLoggedIn &&
    user!.id !== post.user_id &&
    !isBlockedByAuthor &&
    !isCurrentUserBannedOrSuspended

  const tipDisabledReason = !canTip
    ? !isLoggedIn
      ? '请先登录'
      : user!.id === post.user_id
        ? '不能给自己打赏'
        : isBlockedByAuthor
          ? '您已被作者拉黑'
          : isCurrentUserBannedOrSuspended
            ? '您的账号状态异常'
            : undefined
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
  }
}

