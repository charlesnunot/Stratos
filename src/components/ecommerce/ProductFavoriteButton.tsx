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
    const previousCount = favoriteCount
    const newCount = currentIsFavorite ? Math.max(0, previousCount - 1) : previousCount + 1

    // 乐观更新：在调用 mutate 之前同步执行
    setOptimisticFavorites(newCount)
    queryClient.setQueryData(['product', productId], (old: unknown) => {
      if (old && typeof old === 'object' && 'favorite_count' in old) {
        return { ...(old as Record<string, unknown>), favorite_count: newCount }
      }
      return old
    })
    queryClient.setQueriesData({ queryKey: ['products'] }, (old: unknown) => {
      if (!old || !Array.isArray(old)) return old
      return old.map((p: { id?: string; favorite_count?: number }) =>
        p.id === productId ? { ...p, favorite_count: newCount } : p
      )
    })

    toggleFavorite.mutate(
      {
        itemType: 'product',
        itemId: productId,
        isFavorite: currentIsFavorite,
      },
      {
        onError: () => {
          // 失败时回滚
          setOptimisticFavorites(previousCount)
          queryClient.setQueryData(['product', productId], (old: unknown) => {
            if (old && typeof old === 'object' && 'favorite_count' in old) {
              return { ...(old as Record<string, unknown>), favorite_count: previousCount }
            }
            return old
          })
          queryClient.setQueriesData({ queryKey: ['products'] }, (old: unknown) => {
            if (!old || !Array.isArray(old)) return old
            return old.map((p: { id?: string; favorite_count?: number }) =>
              p.id === productId ? { ...p, favorite_count: previousCount } : p
            )
          })
        },
        onSettled: () => {
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
