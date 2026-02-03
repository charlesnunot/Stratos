import type { SupabaseClient } from '@supabase/supabase-js'

const CONVERSATION_TIMEOUT_MS = 3000

/**
 * 获取或创建私聊会话的核心逻辑（无 React hooks）。
 * 供 useConversation 与 ChatNavigationService 共用。
 */
export async function getOrCreateConversationCore(
  supabase: SupabaseClient,
  currentUserId: string,
  otherUserId: string
): Promise<string> {
  if (!currentUserId) {
    throw new Error('User not authenticated')
  }
  if (!otherUserId) {
    throw new Error('otherUserId is required')
  }
  if (otherUserId === currentUserId) {
    throw new Error('Cannot create conversation with self')
  }

  const cacheKey = `conversation_${currentUserId}_${otherUserId}`
  const cachedConversationId =
    typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null

  if (cachedConversationId) {
    try {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', cachedConversationId)
        .single()

      if (conversation) {
        return cachedConversationId
      }
    } catch {
      // 缓存无效，继续执行
    }
  }

  const rpcPromise = supabase.rpc('get_or_create_private_conversation', {
    p_other_id: otherUserId,
  })
  const timeoutPromise = new Promise<Awaited<ReturnType<typeof supabase.rpc>>>(
    (_, reject) => {
      setTimeout(
        () => reject(new Error('打开聊天超时，请重试')),
        CONVERSATION_TIMEOUT_MS
      )
    }
  )
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
    throw new Error(
      msg.includes('create') || msg.includes('authenticated') || msg.includes('self')
        ? msg
        : `无法发起私聊: ${msg}`
    )
  }

  if (!conversationId || typeof conversationId !== 'string') {
    throw new Error('无法发起私聊，请重试')
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(cacheKey, conversationId)
    } catch {
      // 忽略缓存错误
    }
  }

  return conversationId
}
