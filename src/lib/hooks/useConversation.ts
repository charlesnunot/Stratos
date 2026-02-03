import { useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { getOrCreateConversationCore } from '@/lib/chat/getOrCreateConversationCore'

/**
 * 获取或创建私聊会话（复用现有 messages 系统）。
 * 核心逻辑在 getOrCreateConversationCore，供 ChatNavigationService 共用。
 */
export function useConversation() {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const getOrCreateConversation = useCallback(
    async (otherUserId: string): Promise<string> => {
      if (!user) {
        throw new Error('User not authenticated')
      }
      return getOrCreateConversationCore(supabase, user.id, otherUserId)
    },
    [supabase, user]
  )

  return { getOrCreateConversation }
}
