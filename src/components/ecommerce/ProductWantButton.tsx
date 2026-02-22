'use client'

import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ProductWantButtonProps {
  productId: string
  initialWants: number
}

export function ProductWantButton({ productId, initialWants }: ProductWantButtonProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [optimisticWants, setOptimisticWants] = useState(initialWants)

  // Check if user has wanted this product
  const { data: userWant } = useQuery({
    queryKey: ['productWant', productId, user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('product_wants')
        .select('user_id')
        .eq('product_id', productId)
        .eq('user_id', user.id)
        .maybeSingle()
      return data
    },
    enabled: !!user,
  })

  const isWanted = !!userWant

  // Get current want count from product data (optimized - uses cached want_count field)
  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('want_count')
        .eq('id', productId)
        .single()
      if (error) throw error
      return data
    },
    enabled: false, // Don't fetch automatically, use initialWants
  })

  // Use product.want_count if available, otherwise fall back to initialWants
  const wantCount = product?.want_count ?? initialWants

  // Sync wantCount to optimisticWants when it changes
  useEffect(() => {
    // 当 wantCount 有值时，同步到 optimisticWants
    if (wantCount !== undefined && wantCount !== null) {
      setOptimisticWants(wantCount)
    } else {
      // 当 wantCount 还没有加载时，使用 initialWants
      setOptimisticWants(initialWants)
    }
  }, [initialWants, wantCount])

  const wantMutation = useMutation({
    mutationFn: async (shouldWant: boolean) => {
      if (!user) throw new Error('Not authenticated')

      if (shouldWant) {
        const { error } = await supabase
          .from('product_wants')
          .insert({ user_id: user.id, product_id: productId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('product_wants')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId)
        if (error) throw error
      }
    },
    onMutate: async (shouldWant) => {
      // 获取当前值
      const previousCount = wantCount
      
      // 计算新值
      const newCount = shouldWant ? previousCount + 1 : Math.max(0, previousCount - 1)
      
      // 更新 optimistic state
      setOptimisticWants(newCount)
      
      // 更新 product cache 中的 want_count
      queryClient.setQueryData(['product', productId], (old: any) => {
        if (old) {
          return { ...old, want_count: newCount }
        }
        return old
      })
      
      // 更新 products list cache (if exists)
      queryClient.setQueriesData({ queryKey: ['products'] }, (old: any) => {
        if (!old) return old
        if (Array.isArray(old)) {
          return old.map((p: any) =>
            p.id === productId ? { ...p, want_count: newCount } : p
          )
        }
        return old
      })
      
      return { previousCount }
    },
    onError: (err, shouldWant, context) => {
      // Rollback on error
      if (context?.previousCount !== undefined) {
        setOptimisticWants(context.previousCount)
        queryClient.setQueryData(['product', productId], (old: any) => {
          if (old) {
            return { ...old, want_count: context.previousCount }
          }
          return old
        })
      }
    },
    onSettled: () => {
      // Invalidate product and products queries to refetch with updated want_count
      queryClient.invalidateQueries({ queryKey: ['product', productId] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['productWant', productId, user?.id] })
    },
  })

  const handleWant = () => {
    if (!user) return
    wantMutation.mutate(!isWanted)
  }

  const displayWants = optimisticWants !== wantCount ? optimisticWants : (wantCount || initialWants)

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 sm:gap-2 shrink-0"
      onClick={handleWant}
      disabled={!user || wantMutation.isPending}
    >
      <Sparkles
        className={`h-4 w-4 shrink-0 ${isWanted ? 'fill-yellow-500 text-yellow-500' : ''}`}
      />
      <span className="text-xs sm:text-sm whitespace-nowrap">{displayWants}</span>
    </Button>
  )
}