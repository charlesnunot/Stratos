import { useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'

/**
 * 获取或创建私聊会话（复用现有 messages 系统）。
 * - 仅处理 private 会话
 * - 对 (user, otherUser) 做对称去重
 */
export function useConversation() {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const CONVERSATION_TIMEOUT_MS = 8000 // 10 秒内必达：留 2 秒给跳转，RPC 限 8 秒

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

      // 直接调 RPC，不再先 getSession()，减少一次网络往返；未登录时 RPC 会返回 auth 错误
      const rpcPromise = supabase.rpc('get_or_create_private_conversation', {
        p_other_id: otherUserId,
      })
      const timeoutPromise = new Promise<Awaited<ReturnType<typeof supabase.rpc>>>((_, reject) => {
        setTimeout(() => reject(new Error('打开聊天超时，请重试')), CONVERSATION_TIMEOUT_MS)
      })
      const result = await Promise.race([rpcPromise, timeoutPromise])
      const { data: conversationId, error: rpcError } = result

      if (rpcError) {
        const isAbortError =
          rpcError?.name === 'AbortError' ||
          (typeof rpcError?.message === 'string' &&
            (rpcError.message.includes('aborted') ||
              rpcError.message.includes('cancelled') ||
              rpcError.message === 'signal is aborted without reason'))
        if (isAbortError) throw new Error('请求被取消，请重试')
        const msg = rpcError?.message ?? ''
        throw new Error(msg.includes('create') || msg.includes('authenticated') || msg.includes('self') ? msg : `无法发起私聊: ${msg}`)
      }

      if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('无法发起私聊，请重试')
      }

      return conversationId
    },
    [supabase, user]
  )

  return { getOrCreateConversation }
}

