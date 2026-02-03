'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { Heart } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showError, showSuccess, showWarning, showInfo } from '@/lib/utils/toast'
import { useTranslations } from 'next-intl'
import { logAudit } from '@/lib/api/audit'

const BURST_COUNT = 10
const BURST_RADIUS = 28
const BURST_DURATION = 0.6
const HEART_POP_DURATION = 0.35

interface LikeButtonProps {
  postId: string
  initialLikes: number
  enabled?: boolean
}

export function LikeButton({ postId, initialLikes, enabled = true }: LikeButtonProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const t = useTranslations('posts')
  const [optimisticLikes, setOptimisticLikes] = useState(initialLikes)
  const [burst, setBurst] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

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
      if (!user) {
        showInfo(t('pleaseLoginToLike'))
        throw new Error('Not authenticated')
      }

      if (shouldLike) {
        const { error } = await supabase
          .from('likes')
          .insert({ user_id: user.id, post_id: postId })
        
        // 如果是唯一约束冲突（记录已存在），忽略错误
        if (error && error.code !== '23505') {
          throw error
        }
        
        // 记录审计日志
        logAudit({
          action: 'like_post',
          userId: user.id,
          resourceId: postId,
          resourceType: 'post',
          result: 'success',
          timestamp: new Date().toISOString(),
        })
      } else {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
        if (error) throw error
        
        // 记录审计日志
        logAudit({
          action: 'unlike_post',
          userId: user.id,
          resourceId: postId,
          resourceType: 'post',
          result: 'success',
          timestamp: new Date().toISOString(),
        })
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
        showWarning(t('rateLimitExceeded'))
      } else {
        const userFriendlyMessage = shouldLike ? t('likeFailed') : t('unlikeFailed')
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
    if (!enabled) {
      return
    }
    if (!user) {
      showInfo(t('pleaseLoginToLike'))
      return
    }
    
    // 如果正在处理中，忽略点击
    if (likeMutation.isPending) {
      return
    }
    
    // 清除之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // 防抖：300ms内只执行一次
    debounceTimerRef.current = setTimeout(() => {
      const willLike = !isLiked
      if (willLike) {
        setBurst(true)
        setTimeout(() => setBurst(false), BURST_DURATION * 1000 + 50)
      }
      likeMutation.mutate(willLike)
    }, 300)
  }
  
  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Display logic: prioritize query result, fallback to optimistic update, then initialLikes
  // This ensures we always show the most accurate count
  const displayLikes = likeCount !== undefined && likeCount !== null 
    ? (optimisticLikes !== likeCount ? optimisticLikes : likeCount)
    : optimisticLikes

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 sm:gap-2 shrink-0 overflow-visible"
      onClick={handleLike}
      disabled={!enabled || likeMutation.isPending}
    >
      <span className="relative inline-flex shrink-0">
        <motion.span
          className="inline-flex"
          initial={false}
          animate={{
            scale:
              burst && isLiked
                ? [1, 1.45, 1.08]
                : isLiked
                  ? 1.08
                  : 1,
          }}
          transition={
            burst && isLiked
              ? {
                  duration: HEART_POP_DURATION,
                  ease: [0.34, 1.56, 0.64, 1],
                }
              : {
                  type: 'spring',
                  stiffness: 480,
                  damping: 14,
                }
          }
        >
          <Heart
            className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
              isLiked ? 'fill-red-500 text-red-500' : ''
            }`}
          />
        </motion.span>
        {burst && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden
          >
            {Array.from({ length: BURST_COUNT }).map((_, i) => {
              const angle = (i / BURST_COUNT) * 2 * Math.PI
              const x = Math.cos(angle) * BURST_RADIUS
              const y = Math.sin(angle) * BURST_RADIUS
              return (
                <motion.div
                  key={i}
                  className="absolute left-0 top-0 w-1.5 h-1.5 rounded-full bg-red-500"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x,
                    y,
                    opacity: 0,
                    scale: 0,
                  }}
                  transition={{
                    duration: BURST_DURATION,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                />
              )
            })}
          </div>
        )}
      </span>
      <span className="text-xs sm:text-sm whitespace-nowrap">{displayLikes}</span>
    </Button>
  )
}
