'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

/**
 * 检查当前用户是否已拉黑指定用户
 */
export function useIsBlocked(blockedUserId: string) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['isBlocked', user?.id, blockedUserId],
    queryFn: async () => {
      if (!user) return false
      const { data, error } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', user.id)
        .eq('blocked_id', blockedUserId)
        .limit(1)
        .maybeSingle()
      
      if (error) throw error
      return !!data
    },
    enabled: !!user && !!blockedUserId && user.id !== blockedUserId,
  })
}

/**
 * 拉黑/取消拉黑用户
 */
export function useBlock() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      blockedUserId, 
      shouldBlock
    }: { 
      blockedUserId: string
      shouldBlock: boolean
    }) => {
      if (!user) throw new Error('Not authenticated')
      if (user.id === blockedUserId) throw new Error('Cannot block yourself')

      if (shouldBlock) {
        const { error } = await supabase
          .from('blocked_users')
          .insert({
            blocker_id: user.id,
            blocked_id: blockedUserId,
          })
        
        // 如果是唯一约束冲突（记录已存在），忽略错误
        if (error && error.code !== '23505') {
          throw error
        }
      } else {
        const { error } = await supabase
          .from('blocked_users')
          .delete()
          .eq('blocker_id', user.id)
          .eq('blocked_id', blockedUserId)
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['isBlocked', user?.id, variables.blockedUserId] })
    },
  })
}
