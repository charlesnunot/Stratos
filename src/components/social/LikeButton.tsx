'use client'

import { useMemo, useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showError, showSuccess, showWarning } from '@/lib/utils/toast'

interface LikeButtonProps {
  postId: string
  initialLikes: number
}

export function LikeButton({ postId, initialLikes }: LikeButtonProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const [optimisticLikes, setOptimisticLikes] = useState(initialLikes)

  // Check if user has liked this post
  const { data: userLike } = useQuery({
    queryKey: ['like', postId, user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('likes')
        .select('*')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .limit(1)
      
      if (error) throw error
      return data && data.length > 0 ? data[0] : null
    },
    enabled: !!user,
  })

  const isLiked = !!userLike

  // Get current like count
  // Use placeholderData instead of initialData to ensure query results take priority
  const { data: likeCount, isLoading: isLikeCountLoading } = useQuery({
    queryKey: ['likeCount', postId],
    queryFn: async () => {
      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId)
      return count || 0
    },
    placeholderData: initialLikes, // Only used while loading, query result will override
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true, // Refetch on component mount
  })

  // Realtime: keep like count in sync across users
  useEffect(() => {
    const channel = supabase
      .channel(`likes:${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'likes',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['likeCount', postId] })
          queryClient.invalidateQueries({ queryKey: ['like', postId, user?.id] })
          queryClient.invalidateQueries({ queryKey: ['post', postId] })
          queryClient.invalidateQueries({ queryKey: ['posts'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [postId, queryClient, supabase, user?.id])

  // Sync optimisticLikes with actual query result
  useEffect(() => {
    // Update optimisticLikes when query result is available
    if (likeCount !== undefined && likeCount !== null && !isLikeCountLoading) {
      setOptimisticLikes(likeCount)
    } else if (likeCount === undefined || likeCount === null) {
      // Fallback to initialLikes only if query hasn't loaded
      setOptimisticLikes(initialLikes)
    }
  }, [likeCount, isLikeCountLoading, initialLikes])

  const likeMutation = useMutation({
    mutationFn: async (shouldLike: boolean) => {
      if (!user) throw new Error('Not authenticated')

      if (shouldLike) {
        const { error } = await supabase
          .from('likes')
          .insert({ user_id: user.id, post_id: postId })
        
        // 如果是唯一约束冲突（记录已存在），忽略错误
        if (error && error.code !== '23505') {
          throw error
        }
      } else {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
        if (error) throw error
      }
    },
    onMutate: async (shouldLike) => {
      const previousOptimisticLikes = optimisticLikes
      // Optimistic update
      setOptimisticLikes((prev) => (shouldLike ? prev + 1 : Math.max(0, prev - 1)))
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['likeCount', postId] })
      
      // Snapshot previous value
      const previousCount = queryClient.getQueryData(['likeCount', postId])
      
      // Optimistically update
      queryClient.setQueryData(['likeCount', postId], (old: number) =>
        shouldLike ? old + 1 : Math.max(0, old - 1)
      )
      
      return { previousCount, previousOptimisticLikes }
    },
    onError: (err: any, shouldLike, context) => {
      // Rollback on error
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(['likeCount', postId], context.previousCount)
      }
      if (context?.previousOptimisticLikes !== undefined) {
        setOptimisticLikes(context.previousOptimisticLikes as number)
      } else {
        setOptimisticLikes(likeCount || initialLikes)
      }

      // Show error feedback to user
      const errorMessage = String(err?.message || '')
      if (errorMessage.includes('Rate limit exceeded')) {
        showWarning('操作过于频繁，请稍后再试')
      } else {
        const userFriendlyMessage = shouldLike ? '点赞失败，请重试' : '取消点赞失败，请重试'
        showError(userFriendlyMessage)
        console.error('Like error:', err)
      }
    },
    onSuccess: (_data, shouldLike) => {
      // Show success feedback (optional, can be removed if too noisy)
      // showSuccess(shouldLike ? '已点赞' : '已取消点赞')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['likeCount', postId] })
      queryClient.invalidateQueries({ queryKey: ['like', postId, user?.id] })
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })

  const handleLike = () => {
    if (!user) return
    likeMutation.mutate(!isLiked)
  }

  // Display logic: prioritize query result, fallback to optimistic update, then initialLikes
  // This ensures we always show the most accurate count
  const displayLikes = likeCount !== undefined && likeCount !== null 
    ? (optimisticLikes !== likeCount ? optimisticLikes : likeCount)
    : optimisticLikes

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 sm:gap-2 shrink-0"
      onClick={handleLike}
      disabled={!user || likeMutation.isPending}
    >
      <Heart
        className={`h-4 w-4 shrink-0 ${isLiked ? 'fill-red-500 text-red-500' : ''}`}
      />
      <span className="text-xs sm:text-sm whitespace-nowrap">{displayLikes}</span>
    </Button>
  )
}
