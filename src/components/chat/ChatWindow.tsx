'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { handleError } from '@/lib/utils/handleError'
import { Button } from '@/components/ui/button'
import { MessageBubble } from './MessageBubble'
import { useTranslations } from 'next-intl'

interface ChatWindowProps {
  conversationId: string
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('messages')

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const appendMessageDeduped = useCallback((msg: any) => {
    setMessages((prev) => {
      if (!msg) return prev
      const msgId = msg.id
      if (msgId && prev.some((m) => m?.id === msgId)) return prev

      // fallback: content + sender + created_at 组合去重
      const key = `${msg?.sender_id ?? ''}\u0000${msg?.created_at ?? ''}\u0000${msg?.content ?? ''}`
      if (prev.some((m) => `${m?.sender_id ?? ''}\u0000${m?.created_at ?? ''}\u0000${m?.content ?? ''}` === key)) {
        return prev
      }
      return [...prev, msg]
    })
  }, [])

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
      return
    }

    if (data) {
      setMessages(data)

      // Mark messages as read (best-effort)
      if (user) {
        const { error: readError } = await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_id', user.id)
          .eq('is_read', false)
        if (readError) {
          console.error('Error marking messages as read:', readError)
        }
      }
    }
  }, [conversationId, supabase, user])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    // Subscribe to new messages
    const channel = supabase
      .channel(`messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          appendMessageDeduped(payload.new)
          scrollToBottom()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [appendMessageDeduped, conversationId, scrollToBottom, supabase])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const updateConversationLastMessage = async () => {
    // Update conversation last_message_at and last_message_id
    const { data: newMsg, error: lastMsgError } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (lastMsgError) {
      console.error('Error getting last message id:', lastMsgError)
      return
    }

    const { error: updateConvError } = await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_id: newMsg?.id,
      })
      .eq('id', conversationId)

    if (updateConvError) {
      console.error('Error updating conversation last message:', updateConvError)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newMessage.trim()) return

    const content = newMessage.trim()

    setLoading(true)
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: 'text',
      })

      if (error) {
        console.error('Send message error:', error)
        handleError(error, '发送失败，请重试')
        return
      }

      // 乐观更新：确保“发送成功”后 UI 立刻显示（不依赖 Realtime）
      const optimisticMsg = {
        id: `temp_${Date.now()}`,
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        message_type: 'text',
        created_at: new Date().toISOString(),
      }
      appendMessageDeduped(optimisticMsg)

      setNewMessage('')

      // best-effort: 更新会话的 last_message 字段（可被 DB trigger 替代）
      try {
        await updateConversationLastMessage()
      } catch (err) {
        console.error('Error updating conversation last message:', err)
      }

      // 校正拉取：避免 Realtime 失效时 UI 与 DB 不一致
      await loadMessages()
    } catch (error) {
      handleError(error, '发送失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-[600px] flex-col">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={message.sender_id === user?.id}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={t('typeMessagePlaceholder')}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2"
          />
          <Button type="submit" disabled={loading || !newMessage.trim()}>
            {t('send')}
          </Button>
        </div>
      </form>
    </div>
  )
}
