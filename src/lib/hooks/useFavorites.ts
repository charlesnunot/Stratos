'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { handleError } from '@/lib/utils/handleError'

export type FavoriteItemType = 'post' | 'product' | 'user' | 'comment' | 'order' | 'affiliate_post' | 'tip' | 'message'

export interface Favorite {
  id: string
  user_id: string
  item_type: FavoriteItemType
  item_id: string
  notes: string | null
  created_at: string
}

/**
 * 检查某个内容是否已被当前用户收藏
 */
export function useIsFavorite(itemType: FavoriteItemType, itemId: string) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['isFavorite', user?.id, itemType, itemId],
    queryFn: async () => {
      if (!user) {
        console.log('useIsFavorite: No user, returning false')
        return false
      }
      
      console.log('useIsFavorite: Checking favorite status:', {
        itemType,
        itemId,
        userId: user.id,
      })
      
      try {
        const { data, error } = await supabase
          .from('favorites')
          .select('*')
          .eq('user_id', user.id)
          .eq('item_type', itemType)
          .eq('item_id', itemId)
          .limit(1)
        
        if (error) {
          console.error('useIsFavorite: Query error:', {
            error,
            errorCode: error.code,
            errorMessage: error.message,
            itemType,
            itemId,
            userId: user.id,
          })
          throw error
        }
        
        const isFavorite = data && data.length > 0
        console.log('useIsFavorite: Result:', {
          itemType,
          itemId,
          userId: user.id,
          isFavorite,
          foundRecords: data?.length || 0,
        })
        
        return isFavorite
      } catch (err: any) {
        // 忽略 AbortError，这是正常的查询取消（React Query 会自动处理）
        if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('cancelled') || err?.message === 'signal is aborted without reason') {
          console.log('useIsFavorite: Query cancelled, ignoring error')
          // 返回默认值而不是抛出错误
          return false
        }
        throw err
      }
    },
    enabled: !!user && !!itemId,
    retry: (failureCount, error: any) => {
      // 如果是 AbortError，不重试
      if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('cancelled') || error?.message === 'signal is aborted without reason') {
        return false
      }
      return failureCount < 1
    },
  })
}

/**
 * 切换收藏状态
 */
export function useToggleFavorite() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      itemType, 
      itemId, 
      isFavorite 
    }: { 
      itemType: FavoriteItemType
      itemId: string
      isFavorite: boolean 
    }) => {
      if (!user) {
        console.error('Toggle favorite: User not authenticated')
        throw new Error('Not authenticated')
      }

      // 验证用户认证状态
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        
        // 忽略 AbortError（请求被取消）
        if (authError && 
            authError.name !== 'AbortError' && 
            !authError.message?.includes('aborted') &&
            authError.message !== 'signal is aborted without reason') {
          console.error('Toggle favorite: Auth verification failed:', {
            authError,
            authUser,
            userId: user?.id,
          })
          throw new Error('Authentication verification failed')
        }
        
        if (!authUser) {
          console.error('Toggle favorite: No auth user found')
          throw new Error('Authentication verification failed')
        }

        if (authUser.id !== user.id) {
          console.error('Toggle favorite: User ID mismatch:', {
            authUserId: authUser.id,
            hookUserId: user.id,
          })
          throw new Error('User ID mismatch')
        }
      } catch (err: any) {
        // 忽略 AbortError，这是正常的请求取消
        if (err?.name === 'AbortError' || 
            err?.message?.includes('aborted') || 
            err?.message?.includes('cancelled') ||
            err?.message === 'signal is aborted without reason') {
          console.log('Toggle favorite: Request cancelled, skipping auth verification')
          // 如果请求被取消，我们仍然可以继续，因为 user 对象已经存在
          // 但为了安全，我们仍然抛出错误让调用者知道
          throw new Error('Request was cancelled')
        }
        throw err
      }

      console.log('Toggle favorite operation:', {
        itemType,
        itemId,
        isFavorite,
        userId: user.id,
        operation: isFavorite ? 'delete' : 'insert',
      })

      if (isFavorite) {
        // 取消收藏
        const { error, data } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('item_type', itemType)
          .eq('item_id', itemId)
          .select()
        
        if (error) {
          console.error('Delete favorite error:', {
            error,
            errorCode: error.code,
            errorMessage: error.message,
            itemType,
            itemId,
            userId: user.id,
          })
          throw error
        }
        
        console.log('Delete favorite success:', {
          deletedCount: data?.length || 0,
          itemType,
          itemId,
        })
      } else {
        // 添加收藏
        const { error, data } = await supabase
          .from('favorites')
          .insert({
            user_id: user.id,
            item_type: itemType,
            item_id: itemId,
          })
          .select()
        
        if (error) {
          console.error('Insert favorite error:', {
            error,
            errorCode: error.code,
            errorMessage: error.message,
            itemType,
            itemId,
            userId: user.id,
          })
          
          // 如果是唯一约束冲突（记录已存在），忽略错误
          if (error.code === '23505') {
            console.warn('Favorite already exists (unique constraint), ignoring:', {
              itemType,
              itemId,
              userId: user.id,
            })
            // 不抛出错误，因为记录已经存在，操作实际上是成功的
          } else {
            throw error
          }
        } else {
          console.log('Insert favorite success:', {
            insertedCount: data?.length || 0,
            itemType,
            itemId,
          })
        }
      }
    },
    onSuccess: (_, variables) => {
      console.log('Toggle favorite onSuccess:', {
        itemType: variables.itemType,
        itemId: variables.itemId,
        wasFavorite: variables.isFavorite,
        newState: !variables.isFavorite,
      })
      
      // 使相关查询失效，触发重新获取
      queryClient.invalidateQueries({ 
        queryKey: ['isFavorite', user?.id, variables.itemType, variables.itemId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['favorites', user?.id] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['favorites', user?.id, variables.itemType] 
      })
      // 失效收藏数量查询，确保收藏数量能正确更新
      queryClient.invalidateQueries({ 
        queryKey: ['favoriteCount', variables.itemType, variables.itemId] 
      })
      
      // 失效 post/product 查询，确保 favorite_count 字段能正确更新
      if (variables.itemType === 'post') {
        queryClient.invalidateQueries({ 
          queryKey: ['post', variables.itemId] 
        })
        queryClient.invalidateQueries({ 
          queryKey: ['posts'] 
        })
      } else if (variables.itemType === 'product') {
        queryClient.invalidateQueries({ 
          queryKey: ['product', variables.itemId] 
        })
        queryClient.invalidateQueries({ 
          queryKey: ['products'] 
        })
      }
    },
    onError: (error, variables) => {
      // 忽略 AbortError，这是正常的请求取消
      if (error?.name === 'AbortError' || 
          error?.message?.includes('aborted') || 
          error?.message?.includes('cancelled') ||
          error?.message === 'signal is aborted without reason') {
        console.log('Toggle favorite: Request cancelled, ignoring error')
        return
      }
      
      console.error('Toggle favorite onError:', {
        error,
        itemType: variables.itemType,
        itemId: variables.itemId,
        isFavorite: variables.isFavorite,
        userId: user?.id,
      })
      handleError(error, '操作失败，请重试')
    },
  })
}

/**
 * 获取用户的收藏列表（可筛选类型）
 */
export function useFavorites(itemType?: FavoriteItemType) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['favorites', user?.id, itemType],
    queryFn: async () => {
      if (!user) return []
      
      try {
        let query = supabase
          .from('favorites')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        
        if (itemType) {
          query = query.eq('item_type', itemType)
        }
        
        const { data, error } = await query
        
        if (error) throw error
        return (data || []) as Favorite[]
      } catch (err: any) {
        // 忽略 AbortError，这是正常的查询取消（React Query 会自动处理）
        if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('cancelled') || err?.message === 'signal is aborted without reason') {
          console.log('useFavorites: Query cancelled, ignoring error')
          // 返回空数组而不是抛出错误
          return []
        }
        throw err
      }
    },
    enabled: !!user,
    retry: (failureCount, error: any) => {
      // 如果是 AbortError，不重试
      if (error?.name === 'AbortError' || error?.message?.includes('aborted') || error?.message?.includes('cancelled') || error?.message === 'signal is aborted without reason') {
        return false
      }
      return failureCount < 1
    },
  })
}
