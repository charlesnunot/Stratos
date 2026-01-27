'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

export interface ViewHistoryItem {
  id: string
  item_type: 'post' | 'product'
  item_id: string
  viewed_at: string
  // Joined data
  post?: {
    id: string
    content: string | null
    image_urls: string[]
    user_id: string
    like_count: number
    comment_count: number
    created_at: string
    user?: {
      id: string
      username: string
      display_name: string | null
      avatar_url: string | null
    }
  }
  product?: {
    id: string
    name: string
    images: string[]
    price: number
    seller_id: string
    status: string
    seller?: {
      id: string
      username: string
      display_name: string | null
      avatar_url: string | null
    }
  }
}

/**
 * 获取用户的浏览历史（帖子和商品）
 */
export function useViewHistory(limit = 50) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['viewHistory', user?.id, limit],
    queryFn: async (): Promise<ViewHistoryItem[]> => {
      if (!user) return []

      const { data, error } = await supabase
        .from('view_history')
        .select('*')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      // Fetch post/product details for each item
      const items: ViewHistoryItem[] = []
      for (const record of data || []) {
        if (record.item_type === 'post') {
          const { data: postData } = await supabase
            .from('posts')
            .select(
              `
              id,
              content,
              image_urls,
              user_id,
              like_count,
              comment_count,
              created_at,
              user:profiles!posts_user_id_fkey (
                id,
                username,
                display_name,
                avatar_url
              )
            `
            )
            .eq('id', record.item_id)
            .eq('status', 'approved')
            .single()

          if (postData) {
            items.push({
              id: record.id,
              item_type: 'post',
              item_id: record.item_id,
              viewed_at: record.viewed_at,
              post: {
                id: postData.id,
                content: postData.content,
                image_urls: postData.image_urls || [],
                user_id: postData.user_id,
                like_count: postData.like_count || 0,
                comment_count: postData.comment_count || 0,
                created_at: postData.created_at,
                user: postData.user as any,
              },
            })
          }
        } else if (record.item_type === 'product') {
          const { data: productData } = await supabase
            .from('products')
            .select(
              `
              id,
              name,
              images,
              price,
              seller_id,
              status,
              seller:profiles!products_seller_id_fkey (
                id,
                username,
                display_name,
                avatar_url
              )
            `
            )
            .eq('id', record.item_id)
            .eq('status', 'active')
            .single()

          if (productData) {
            items.push({
              id: record.id,
              item_type: 'product',
              item_id: record.item_id,
              viewed_at: record.viewed_at,
              product: {
                id: productData.id,
                name: productData.name,
                images: productData.images || [],
                price: productData.price,
                seller_id: productData.seller_id,
                status: productData.status,
                seller: productData.seller as any,
              },
            })
          }
        }
      }

      return items
    },
    enabled: !!user,
  })
}

/**
 * 记录浏览历史（访问帖子或商品时调用）
 */
export function useRecordView() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      itemType,
      itemId,
    }: {
      itemType: 'post' | 'product'
      itemId: string
    }) => {
      if (!user) return

      // Use upsert to update viewed_at if already exists
      const { error } = await supabase
        .from('view_history')
        .upsert(
          {
            user_id: user.id,
            item_type: itemType,
            item_id: itemId,
            viewed_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,item_type,item_id',
          }
        )

      if (error) throw error

      // Invalidate view history query
      queryClient.invalidateQueries({ queryKey: ['viewHistory', user.id] })
    },
  })
}

/**
 * 清除浏览历史
 */
export function useClearViewHistory() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('view_history')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['viewHistory', user.id] })
    },
  })
}
