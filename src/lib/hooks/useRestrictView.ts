'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

/**
 * 检查当前用户是否被指定用户限制查看
 */
export function useIsRestricted(restrictorId: string) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['isRestricted', user?.id, restrictorId],
    queryFn: async () => {
      if (!user) return false
      const { data, error } = await supabase
        .from('restricted_view_users')
        .select('id')
        .eq('restrictor_id', restrictorId)
        .eq('restricted_id', user.id)
        .limit(1)
        .maybeSingle()
      
      if (error) throw error
      return !!data
    },
    enabled: !!user && !!restrictorId && user.id !== restrictorId,
  })
}

/**
 * 限制/取消限制用户查看自己的内容
 */
export function useRestrictView() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      restrictedUserId, 
      shouldRestrict
    }: { 
      restrictedUserId: string
      shouldRestrict: boolean
    }) => {
      if (!user) throw new Error('Not authenticated')
      if (user.id === restrictedUserId) throw new Error('Cannot restrict yourself')

      if (shouldRestrict) {
        const { error } = await supabase
          .from('restricted_view_users')
          .insert({
            restrictor_id: user.id,
            restricted_id: restrictedUserId,
          })
        
        // 如果是唯一约束冲突（记录已存在），忽略错误
        if (error && error.code !== '23505') {
          throw error
        }
      } else {
        const { error } = await supabase
          .from('restricted_view_users')
          .delete()
          .eq('restrictor_id', user.id)
          .eq('restricted_id', restrictedUserId)
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['isRestricted', variables.restrictedUserId, user?.id] })
    },
  })
}
