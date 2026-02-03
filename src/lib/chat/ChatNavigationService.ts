import { startTransition } from 'react'

export type OpenChatShareCard =
  | { type: 'post'; id: string; title?: string; image?: string; url: string }
  | {
      type: 'product'
      id: string
      title?: string
      name?: string
      price?: number
      image?: string
      url: string
    }

export interface OpenChatOptions {
  targetUserId: string
  shareCard?: OpenChatShareCard
  onSuccess?: (conversationId: string) => void
}

export interface OpenChatDeps {
  getConversationId: (targetUserId: string) => Promise<string>
  navigate: (path: string) => void
  invalidateConversations: () => void
}

/**
 * 聊天直达：唯一 await 是 conversationId，立即 navigate，慢操作在 startTransition 内执行。
 */
export async function openChat(
  options: OpenChatOptions,
  deps: OpenChatDeps
): Promise<void> {
  const { targetUserId, shareCard, onSuccess } = options
  const { getConversationId, navigate, invalidateConversations } = deps

  const conversationId = await getConversationId(targetUserId)

  onSuccess?.(conversationId)
  navigate(`/messages/${conversationId}`)

  startTransition(() => {
    if (shareCard) {
      ;(async () => {
        try {
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversation_id: conversationId,
              content: JSON.stringify(shareCard),
              message_type: shareCard.type,
            }),
          })
        } catch (shareError: unknown) {
          const isAbortError =
            shareError instanceof Error &&
            (shareError.name === 'AbortError' ||
              shareError.message?.includes('aborted') ||
              shareError.message?.includes('cancelled') ||
              shareError.message === 'signal is aborted without reason')
          if (!isAbortError && process.env.NODE_ENV === 'development') {
            console.warn('ChatNavigationService: send share card failed', shareError)
          }
        }
      })()
    }
    invalidateConversations()
  })
}
