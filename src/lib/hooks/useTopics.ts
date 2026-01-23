'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'

export function useIsTopicFollowed(topicId?: string) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['isTopicFollowed', user?.id, topicId],
    queryFn: async () => {
      if (!user || !topicId) return false
      const { data, error } = await supabase
        .from('topic_follows')
        .select('*')
        .eq('user_id', user.id)
        .eq('topic_id', topicId)
        .limit(1)

      if (error) throw error
      return !!(data && data.length > 0)
    },
    enabled: !!user && !!topicId,
  })
}

export function useToggleTopicFollow() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ topicId, shouldFollow }: { topicId: string; shouldFollow: boolean }) => {
      if (!user) throw new Error('Not authenticated')
      if (!topicId) throw new Error('topicId is required')

      if (shouldFollow) {
        const { error } = await supabase
          .from('topic_follows')
          .insert({ user_id: user.id, topic_id: topicId })
        if (error && (error as any).code !== '23505') throw error
      } else {
        const { error } = await supabase
          .from('topic_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('topic_id', topicId)
        if (error) throw error
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['isTopicFollowed', user?.id, variables.topicId] })
      // refresh topic meta (follower_count)
      queryClient.invalidateQueries({ queryKey: ['topic'] })
    },
  })
}

