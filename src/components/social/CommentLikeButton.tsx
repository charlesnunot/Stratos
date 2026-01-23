'use client'

import { useEffect, useState, useMemo } from 'react'
import { Heart } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { showError, showWarning } from '@/lib/utils/toast'

interface CommentLikeButtonProps {
  commentId: string
  initialLikes: number
}

export function CommentLikeButton({ commentId, initialLikes }: CommentLikeButtonProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const [optimisticLikes, setOptimisticLikes] = useState(initialLikes)

  const { data: userLike } = useQuery({
    queryKey: ['commentLike', commentId, user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('comment_likes')
        .select('*')
        .eq('comment_id', commentId)
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
    queryKey: ['commentLikeCount', commentId],
    queryFn: async () => {
      const { count } = await supabase
        .from('comment_likes')
        .select('*', { count: 'exact', head: true })
        .eq('comment_id', commentId)
      return count || 0
    },
    placeholderData: initialLikes, // Only used while loading, query result will override
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true, // Refetch on component mount
  })

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
        const { error } = await supabase.from('comment_likes').insert({
          user_id: user.id,
          comment_id: commentId,
        })

        // 如果是唯一约束冲突（记录已存在），忽略错误
        if (error && error.code !== '23505') {
          throw error
        }
      } else {
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('comment_id', commentId)
        if (error) throw error
      }
    },
    onMutate: async (shouldLike) => {
      const previousOptimisticLikes = optimisticLikes
      setOptimisticLikes((prev) => (shouldLike ? prev + 1 : Math.max(0, prev - 1)))

      await queryClient.cancelQueries({ queryKey: ['commentLikeCount', commentId] })
      const previousCount = queryClient.getQueryData(['commentLikeCount', commentId])

      queryClient.setQueryData(['commentLikeCount', commentId], (old: number) =>
        shouldLike ? old + 1 : Math.max(0, old - 1)
      )

      return { previousCount, previousOptimisticLikes }
    },
    onError: (err: any, _shouldLike, context) => {
      // Rollback on error
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(['commentLikeCount', commentId], context.previousCount)
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
        showError('操作失败，请重试')
        console.error('Comment like error:', err)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commentLikeCount', commentId] })
      queryClient.invalidateQueries({ queryKey: ['commentLike', commentId, user?.id] })
      // 评论列表里也可能依赖 posts/comments 查询，宽松刷新一次
      queryClient.invalidateQueries({ queryKey: ['comments'] })
    },
  })

  const handleLike = () => {
    if (!user) return
    likeMutation.mutate(!isLiked)
  }

  // Display logic: prioritize query result, fallback to optimistic update, then initialLikes
  const displayLikes = likeCount !== undefined && likeCount !== null 
    ? (optimisticLikes !== likeCount ? optimisticLikes : likeCount)
    : optimisticLikes

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs gap-1"
      onClick={handleLike}
      disabled={!user || likeMutation.isPending}
      type="button"
    >
      <Heart className={`h-3 w-3 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
      <span className="tabular-nums">{displayLikes}</span>
    </Button>
  )
}

