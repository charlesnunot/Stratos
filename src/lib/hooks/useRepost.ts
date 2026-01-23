'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

/**
 * 检查当前用户是否已转发某个帖子或商品
 */
export function useIsReposted(itemType: 'post' | 'product', itemId: string) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['isReposted', user?.id, itemType, itemId],
    queryFn: async () => {
      if (!user) return false
      
      const { data, error } = await supabase
        .from('reposts')
        .select('id')
        .eq('user_id', user.id)
        .eq('item_type', itemType)
        .eq('original_item_id', itemId)
        .limit(1)
      
      if (error) throw error
      return data && data.length > 0
    },
    enabled: !!user && !!itemId,
  })
}

/**
 * 转发帖子或商品给多个目标用户
 */
export function useRepost() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      itemType,
      itemId, 
      targetUserIds,
      content 
    }: { 
      itemType: 'post' | 'product'
      itemId: string
      targetUserIds: string[]
      content?: string 
    }) => {
      if (!user) throw new Error('Not authenticated')
      if (!targetUserIds || targetUserIds.length === 0) {
        throw new Error('No target users selected')
      }

      // 为每个目标用户创建转发记录
      const repostsToInsert = targetUserIds.map((targetUserId) => ({
        user_id: user.id,
        item_type: itemType,
        original_item_id: itemId,
        target_user_id: targetUserId,
        repost_content: content || null,
      }))

      // 批量插入（忽略已存在的记录）
      const { error, data } = await supabase
        .from('reposts')
        .insert(repostsToInsert)
        .select()

      if (error) {
        // 检查是否是唯一约束冲突
        // Supabase 可能返回不同的错误格式：
        // - error.code === '23505' (PostgreSQL 唯一约束错误代码)
        // - HTTP 409 状态码
        // - 错误消息中包含 "duplicate", "unique", "conflict" 等关键词
        const errorMessage = (error.message || '').toLowerCase()
        const isUniqueConstraintError = 
          error.code === '23505' ||
          error.code === 'PGRST116' ||
          errorMessage.includes('duplicate') ||
          errorMessage.includes('unique') ||
          errorMessage.includes('conflict') ||
          errorMessage.includes('already exists') ||
          (error as any).status === 409

        if (isUniqueConstraintError) {
          // 尝试逐个插入，忽略已存在的记录
          const results = []
          const alreadyExists = []
          
          for (const repost of repostsToInsert) {
            const { error: insertError, data: insertData } = await supabase
              .from('reposts')
              .insert(repost)
              .select()
            
            if (!insertError && insertData && insertData.length > 0) {
              results.push(insertData[0])
            } else if (insertError) {
              // 检查是否是唯一约束冲突（已存在）
              const insertErrorMessage = (insertError.message || '').toLowerCase()
              const isConflict = 
                insertError.code === '23505' ||
                insertError.code === 'PGRST116' ||
                insertErrorMessage.includes('duplicate') ||
                insertErrorMessage.includes('unique') ||
                insertErrorMessage.includes('conflict') ||
                insertErrorMessage.includes('already exists') ||
                (insertError as any).status === 409
              
              if (isConflict) {
                alreadyExists.push(repost.target_user_id)
              } else {
                // 其他错误，记录但不中断流程
                console.warn('Failed to insert repost:', insertError)
              }
            }
          }
          
          return { 
            action: 'repost' as const, 
            count: results.length,
            alreadyExists: alreadyExists.length
          }
        }
        throw error
      }

      return { action: 'repost' as const, count: data?.length || 0, alreadyExists: 0 }
    },
    onSuccess: (_, variables) => {
      // 使相关查询失效以刷新数据
      queryClient.invalidateQueries({ queryKey: ['isReposted', user?.id, variables.itemType, variables.itemId] })
      if (variables.itemType === 'post') {
        queryClient.invalidateQueries({ queryKey: ['post', variables.itemId] })
        queryClient.invalidateQueries({ queryKey: ['posts'] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['product', variables.itemId] })
        queryClient.invalidateQueries({ queryKey: ['products'] })
      }
      queryClient.invalidateQueries({ queryKey: ['reposts', variables.itemId] })
    },
  })
}

/**
 * 获取某个帖子或商品的转发列表
 */
export function useReposts(itemType: 'post' | 'product', itemId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['reposts', itemType, itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reposts')
        .select(`
          *,
          user:profiles!reposts_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('item_type', itemType)
        .eq('original_item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    },
    enabled: !!itemId,
  })
}

/**
 * 获取用户的转发历史
 */
export function useUserReposts(userId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['userReposts', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reposts')
        .select(`
          *,
          original_post:posts (
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
          original_product:products (
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
 * 获取用户收到的转发（target_user_id = user.id）
 */
export function useReceivedReposts(userId?: string) {
  const { user } = useAuth()
  const supabase = createClient()
  const targetUserId = userId || user?.id

  return useQuery({
    queryKey: ['receivedReposts', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return []
      
      const { data, error } = await supabase
        .from('reposts')
        .select(`
          *,
          user:profiles!reposts_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          ),
          original_post:posts (
            id,
            content,
            image_urls,
            like_count,
            comment_count,
            share_count,
            repost_count,
            created_at,
            user:profiles!posts_user_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          ),
          original_product:products (
            id,
            name,
            description,
            images,
            price,
            like_count,
            want_count,
            share_count,
            repost_count,
            created_at,
            seller:profiles!products_seller_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          )
        `)
        .eq('target_user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    },
    enabled: !!targetUserId,
  })
}
