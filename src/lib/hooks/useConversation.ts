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

      // ✅ 修复 P1: 检查目标用户状态 - 不能给被封禁/暂停的用户发私信
      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', otherUserId)
        .single()

      // 忽略 AbortError
      if (profileError) {
        const isAbortError = 
          profileError?.name === 'AbortError' ||
          profileError?.message?.includes('aborted') ||
          profileError?.message?.includes('cancelled') ||
          profileError?.message === 'signal is aborted without reason'
        
        if (!isAbortError) {
          throw profileError
        }
      }

      if (targetProfile?.status === 'banned' || targetProfile?.status === 'suspended') {
        throw new Error('Cannot send message to banned or suspended user')
      }

      // ✅ 修复 P1: 检查黑名单 - 如果被拉黑，不能发私信
      const { data: blocked, error: blockedError } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', otherUserId)
        .eq('blocked_id', user.id)
        .limit(1)
        .maybeSingle()

      // 忽略 AbortError
      if (blockedError) {
        const isAbortError = 
          blockedError?.name === 'AbortError' ||
          blockedError?.message?.includes('aborted') ||
          blockedError?.message?.includes('cancelled') ||
          blockedError?.message === 'signal is aborted without reason'
        
        if (!isAbortError) {
          throw blockedError
        }
      }

      if (blocked) {
        throw new Error('You have been blocked by this user')
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

      // 忽略 AbortError
      if (existingError) {
        const isAbortError = 
          existingError?.name === 'AbortError' ||
          existingError?.message?.includes('aborted') ||
          existingError?.message?.includes('cancelled') ||
          existingError?.message === 'signal is aborted without reason'
        
        if (!isAbortError) {
          throw existingError
        }
      }
      
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

      // 忽略 AbortError
      if (createError) {
        const isAbortError = 
          createError?.name === 'AbortError' ||
          createError?.message?.includes('aborted') ||
          createError?.message?.includes('cancelled') ||
          createError?.message === 'signal is aborted without reason'
        
        if (!isAbortError) {
          throw createError
        }
      }
      
      if (!conversation?.id) {
        throw new Error('Failed to create conversation')
      }
      
      return conversation.id
    },
    [supabase, user]
  )

  return { getOrCreateConversation }
}

