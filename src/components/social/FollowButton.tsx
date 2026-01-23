'use client'

import { useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useFollow, useIsFollowing } from '@/lib/hooks/useProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { showError, showSuccess } from '@/lib/utils/toast'

interface FollowButtonProps {
  userId: string
}

export function FollowButton({ userId }: FollowButtonProps) {
  // ✅ All Hooks must be called unconditionally and in the same order every render
  const { user } = useAuth()
  const { data: isFollowing } = useIsFollowing(userId)
  const followMutation = useFollow()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  // ✅ useEffect always called, condition handled inside
  useEffect(() => {
    // Handle condition logic inside useEffect
    if (!user || user.id === userId) return

    const channel = supabase
      .channel(`follows:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
          filter: `follower_id=eq.${user.id}`,
        },
        (payload: any) => {
          const followeeId = payload?.new?.followee_id ?? payload?.old?.followee_id
          if (followeeId !== userId) return

          queryClient.invalidateQueries({ queryKey: ['isFollowing', user.id, userId] })
          queryClient.invalidateQueries({ queryKey: ['profile', userId] })
          queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, supabase, user, userId])

  // ✅ useCallback to stabilize the handler function
  const handleFollow = useCallback(async () => {
    if (!user || user.id === userId) return

    try {
      await followMutation.mutateAsync({
        followingId: userId,
        shouldFollow: !isFollowing,
      })
      showSuccess(isFollowing ? '已取消关注' : '关注成功')
    } catch (error: any) {
      console.error('Follow error:', error)
      const errorMessage = error?.message || '操作失败，请重试'
      showError(errorMessage)
    }
  }, [user, userId, isFollowing, followMutation])

  // ✅ Conditional rendering in JSX, not early return
  // All Hooks have been called above, so we can safely return null here
  if (!user || user.id === userId) {
    return null
  }

  return (
    <Button
      onClick={handleFollow}
      disabled={followMutation.isPending}
      variant={isFollowing ? 'outline' : 'default'}
    >
      {followMutation.isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          处理中...
        </>
      ) : isFollowing ? (
        '取消关注'
      ) : (
        '关注'
      )}
    </Button>
  )
}
