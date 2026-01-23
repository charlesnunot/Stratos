'use client'

import { useState, useEffect } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIsFavorite, useToggleFavorite } from '@/lib/hooks/useFavorites'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface ProductFavoriteButtonProps {
  productId: string
  initialFavorites?: number
}

export function ProductFavoriteButton({ productId, initialFavorites = 0 }: ProductFavoriteButtonProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [optimisticFavorites, setOptimisticFavorites] = useState(initialFavorites)

  // Check if user has favorited this product
  const { data: isFavorite } = useIsFavorite('product', productId)

  // Get current favorite count from product data (optimized - uses cached favorite_count field)
  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('favorite_count')
        .eq('id', productId)
        .single()
      if (error) throw error
      return data
    },
    enabled: false, // Don't fetch automatically, use initialFavorites
  })

  // Use product.favorite_count if available, otherwise fall back to initialFavorites
  const favoriteCount = product?.favorite_count ?? initialFavorites

  // Sync favoriteCount to optimisticFavorites when it changes
  useEffect(() => {
    // 当 favoriteCount 有值时，同步到 optimisticFavorites
    if (favoriteCount !== undefined && favoriteCount !== null) {
      setOptimisticFavorites(favoriteCount)
    } else {
      // 当 favoriteCount 还没有加载时，使用 initialFavorites
      setOptimisticFavorites(initialFavorites)
    }
  }, [initialFavorites, favoriteCount])

  const toggleFavorite = useToggleFavorite()

  const handleFavorite = () => {
    if (!user) return
    
    const currentIsFavorite = isFavorite || false
    
    toggleFavorite.mutate(
      {
        itemType: 'product',
        itemId: productId,
        isFavorite: currentIsFavorite,
      },
      {
        onMutate: async () => {
          // 获取当前值
          const previousCount = favoriteCount
          
          // 计算新值
          const newCount = currentIsFavorite ? Math.max(0, previousCount - 1) : previousCount + 1
          
          // 更新 optimistic state
          setOptimisticFavorites(newCount)
          
          // 更新 product cache 中的 favorite_count
          queryClient.setQueryData(['product', productId], (old: any) => {
            if (old) {
              return { ...old, favorite_count: newCount }
            }
            return old
          })
          
          // 更新 products list cache (if exists)
          queryClient.setQueriesData({ queryKey: ['products'] }, (old: any) => {
            if (!old) return old
            if (Array.isArray(old)) {
              return old.map((p: any) =>
                p.id === productId ? { ...p, favorite_count: newCount } : p
              )
            }
            return old
          })
          
          return { previousCount }
        },
        onError: (err, variables, context) => {
          // Rollback on error
          if (context?.previousCount !== undefined) {
            setOptimisticFavorites(context.previousCount)
            queryClient.setQueryData(['product', productId], (old: any) => {
              if (old) {
                return { ...old, favorite_count: context.previousCount }
              }
              return old
            })
          }
        },
        onSettled: () => {
          // Invalidate product and products queries to refetch with updated favorite_count
          queryClient.invalidateQueries({ queryKey: ['product', productId] })
          queryClient.invalidateQueries({ queryKey: ['products'] })
          queryClient.invalidateQueries({ queryKey: ['isFavorite', user?.id, 'product', productId] })
        },
      }
    )
  }

  const displayFavorites = optimisticFavorites !== favoriteCount ? optimisticFavorites : (favoriteCount || initialFavorites)

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 sm:gap-2 shrink-0"
      onClick={handleFavorite}
      disabled={!user || toggleFavorite.isPending}
    >
      <Star
        className={`h-4 w-4 shrink-0 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`}
      />
      <span className="text-xs sm:text-sm whitespace-nowrap">{displayFavorites}</span>
    </Button>
  )
}
