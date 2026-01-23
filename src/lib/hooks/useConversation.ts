import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'

/**
 * 获取或创建私聊会话（复用现有 messages 系统）。
 * - 仅处理 private 会话
 * - 对 (user, otherUser) 做对称去重
 */
export function useConversation() {
  const { user } = useAuth()
  const supabase = createClient()

  const getOrCreateConversation = useCallback(
    async (otherUserId: string): Promise<string> => {
      if (!user) {
        throw new Error('User not authenticated')
      }
      if (!otherUserId) {
        throw new Error('otherUserId is required')
      }
      if (otherUserId === user.id) {
        throw new Error('Cannot create conversation with self')
      }

      // 查找是否已存在（对称匹配）
      const { data: existing, error: existingError } = await supabase
        .from('conversations')
        .select('id')
        .eq('conversation_type', 'private')
        .or(
          `and(participant1_id.eq.${user.id},participant2_id.eq.${otherUserId}),and(participant1_id.eq.${otherUserId},participant2_id.eq.${user.id})`
        )
        .limit(1)
        .maybeSingle()

      if (existingError) throw existingError
      if (existing?.id) return existing.id

      // 创建新会话
      const { data: conversation, error: createError } = await supabase
        .from('conversations')
        .insert({
          participant1_id: user.id,
          participant2_id: otherUserId,
          conversation_type: 'private',
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (createError) throw createError
      return conversation.id
    },
    [supabase, user]
  )

  return { getOrCreateConversation }
}

