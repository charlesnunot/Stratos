'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * 获取用户的分享历史
 */
export function useUserShares(userId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['userShares', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shares')
        .select(`
          *,
          post:posts!shares_item_id_fkey (
            id,
            content,
            image_urls,
            like_count,
            comment_count,
            share_count,
            created_at,
            user:profiles!posts_user_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          ),
          product:products!shares_item_id_fkey (
            id,
            name,
            images,
            price,
            like_count,
            want_count,
            share_count,
            created_at,
            seller:profiles!products_seller_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    },
    enabled: !!userId,
  })
}

/**
 * 获取某个帖子或商品的分享列表（谁分享了它）
 */
export function useShares(itemType: 'post' | 'product', itemId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['shares', itemType, itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shares')
        .select(`
          *,
          user:profiles!shares_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('item_type', itemType)
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    },
    enabled: !!itemId,
  })
}
