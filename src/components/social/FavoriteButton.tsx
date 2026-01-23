'use client'

import { useState, useEffect, useRef } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIsFavorite, useToggleFavorite } from '@/lib/hooks/useFavorites'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface FavoriteButtonProps {
  postId: string
  initialFavorites?: number
}

export function FavoriteButton({ postId, initialFavorites = 0 }: FavoriteButtonProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [optimisticFavorites, setOptimisticFavorites] = useState(initialFavorites)
  const isOptimisticUpdateRef = useRef(false)
  const lastInitialFavoritesRef = useRef(initialFavorites)

  // Check if user has favorited this post
  const { data: isFavorite } = useIsFavorite('post', postId)

  // Sync initialFavorites when it changes from server
  // This handles both initial load and refetch after mutation
  useEffect(() => {
    // Skip if we just did an optimistic update (wait for it to settle)
    if (isOptimisticUpdateRef.current) {
      return
    }

    // If initialFavorites changed from what we last saw, sync it
    // This handles both increases (new favorites) and decreases (removed favorites)
    // We only skip if the value hasn't changed at all
    if (initialFavorites !== lastInitialFavoritesRef.current) {
      console.log('FavoriteButton: Syncing initialFavorites from server', {
        postId,
        oldValue: lastInitialFavoritesRef.current,
        newValue: initialFavorites,
        currentOptimistic: optimisticFavorites,
      })
      setOptimisticFavorites(initialFavorites)
      lastInitialFavoritesRef.current = initialFavorites
    } else if (optimisticFavorites !== initialFavorites) {
      // If values match but state doesn't, sync on mount or after refetch
      console.log('FavoriteButton: Syncing optimisticFavorites to match initialFavorites', {
        postId,
        initialFavorites,
        optimisticFavorites,
      })
      setOptimisticFavorites(initialFavorites)
    }
  }, [initialFavorites, optimisticFavorites, postId])

  const toggleFavorite = useToggleFavorite()

  const handleFavorite = () => {
    if (!user) return
    
    const currentIsFavorite = isFavorite || false
    
    // 获取当前值（使用 optimisticFavorites 而不是从 cache 读取，更可靠）
    const previousCount = optimisticFavorites
    
    // 计算新值
    const newCount = currentIsFavorite ? Math.max(0, previousCount - 1) : previousCount + 1
    
    // 标记正在进行乐观更新（防止 useEffect 覆盖）
    isOptimisticUpdateRef.current = true
    
    // 立即更新 optimistic state（用户看到即时反馈）
    setOptimisticFavorites(newCount)
    lastInitialFavoritesRef.current = newCount
    
    console.log('FavoriteButton: Optimistic update', {
      postId,
      previousCount,
      newCount,
      currentIsFavorite,
    })
    
    // 更新 post cache 中的 favorite_count
    queryClient.setQueryData(['post', postId], (old: any) => {
      if (old) {
        return { ...old, favorite_count: newCount }
      }
      return old
    })
    
    // 更新 posts list cache（确保列表页也显示更新）
    queryClient.setQueriesData({ queryKey: ['posts'] }, (old: any) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages?.map((page: any[]) =>
          page.map((p: any) =>
            p.id === postId ? { ...p, favorite_count: newCount } : p
          )
        ),
      }
    })
    
    toggleFavorite.mutate(
      {
        itemType: 'post',
        itemId: postId,
        isFavorite: currentIsFavorite,
      },
      {
        onError: (err) => {
          // Rollback on error
          console.error('FavoriteButton: Toggle error', {
            postId,
            error: err,
            previousCount,
          })
          isOptimisticUpdateRef.current = false
          setOptimisticFavorites(previousCount)
          lastInitialFavoritesRef.current = previousCount
          queryClient.setQueryData(['post', postId], (old: any) => {
            if (old) {
              return { ...old, favorite_count: previousCount }
            }
            return old
          })
        },
        onSettled: () => {
          // 延迟清除乐观更新标记，给数据库触发器时间执行
          // 注意：useToggleFavorite 的 onSuccess 已经会 invalidate 相关查询
          // 这里只需要清除标记，让 useEffect 能够同步新的数据
          setTimeout(() => {
            isOptimisticUpdateRef.current = false
            console.log('FavoriteButton: Clearing optimistic update flag', { postId })
          }, 1000) // 1 秒应该足够数据库触发器执行
        },
      }
    )
  }

  // Always use optimisticFavorites for display (it's the source of truth for UI)
  // This ensures the UI stays consistent even if refetch returns stale data
  const displayFavorites = optimisticFavorites

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
