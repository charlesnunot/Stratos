'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showWarning } from '@/lib/utils/toast'
import { useTranslations } from 'next-intl'

const DEBOUNCE_MS = 300

interface ProductLikeButtonProps {
  productId: string
  initialLikes: number
}

export function ProductLikeButton({ productId, initialLikes }: ProductLikeButtonProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useTranslations('posts')
  const [optimisticLikes, setOptimisticLikes] = useState(initialLikes)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Check if user has liked this product
  const { data: userLike } = useQuery({
    queryKey: ['productLike', productId, user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('product_likes')
        .select('user_id')
        .eq('product_id', productId)
        .eq('user_id', user.id)
        .single()
      return data
    },
    enabled: !!user,
  })

  const isLiked = !!userLike

  // Get current like count
  const { data: likeCount } = useQuery({
    queryKey: ['productLikeCount', productId],
    queryFn: async () => {
      const { count } = await supabase
        .from('product_likes')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId)
      return count || 0
    },
    initialData: initialLikes,
  })

  const likeMutation = useMutation({
    mutationFn: async (shouldLike: boolean) => {
      if (!user) throw new Error('Not authenticated')

      if (shouldLike) {
        const { error } = await supabase
          .from('product_likes')
          .insert({ user_id: user.id, product_id: productId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('product_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId)
        if (error) throw error
      }
    },
    onMutate: async (shouldLike) => {
      const previousOptimisticLikes = optimisticLikes
      setOptimisticLikes((prev) => (shouldLike ? prev + 1 : Math.max(0, prev - 1)))
      
      await queryClient.cancelQueries({ queryKey: ['productLikeCount', productId] })
      const previousCount = queryClient.getQueryData(['productLikeCount', productId])
      
      queryClient.setQueryData(['productLikeCount', productId], (old: number) =>
        shouldLike ? old + 1 : Math.max(0, old - 1)
      )
      
      return { previousCount, previousOptimisticLikes }
    },
    onError: (err, shouldLike, context) => {
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(['productLikeCount', productId], context.previousCount)
      }
      setOptimisticLikes(context?.previousOptimisticLikes ?? likeCount ?? initialLikes)
      const msg = String(err instanceof Error ? err.message : '')
      if (msg.includes('Rate limit exceeded')) {
        showWarning(t('rateLimitExceededShort'))
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['productLikeCount', productId] })
      queryClient.invalidateQueries({ queryKey: ['productLike', productId, user?.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const handleLike = useCallback(() => {
    if (!user) return
    if (likeMutation.isPending) return
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      likeMutation.mutate(!isLiked)
    }, DEBOUNCE_MS)
  }, [user, isLiked, likeMutation])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  const displayLikes = optimisticLikes !== likeCount ? optimisticLikes : (likeCount || initialLikes)

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