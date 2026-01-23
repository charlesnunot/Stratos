'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/useAuth'
import { useConversation } from '@/lib/hooks/useConversation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'

type ShareCard =
  | {
      type: 'post'
      id: string
      title?: string
      image?: string
      url: string
    }
  | {
      type: 'product'
      id: string
      title?: string
      name?: string
      price?: number
      image?: string
      url: string
    }

interface ChatButtonProps {
  targetUserId: string
  targetUserName?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default' | 'lg' | 'icon'
  className?: string
  onSuccess?: (conversationId: string) => void
  /**
   * 可选：进入会话前先发送一条卡片消息（帖子/商品）。
   * 用于“从详情页发起私聊，并把当前内容分享给对方”。
   */
  shareCard?: ShareCard
  children?: React.ReactNode
}

export function ChatButton({
  targetUserId,
  targetUserName,
  variant = 'outline',
  size = 'sm',
  className,
  onSuccess,
  shareCard,
  children,
}: ChatButtonProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { getOrCreateConversation } = useConversation()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('messages')
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!user) {
      toast({
        variant: 'warning',
        title: '提示',
        description: '请先登录后再私聊',
      })
      return
    }

    if (!targetUserId || targetUserId === user.id) return

    setLoading(true)
    try {
      const conversationId = await getOrCreateConversation(targetUserId)

      // 可选：先发送卡片（不依赖 chat 页面解析参数）
      if (shareCard) {
        const messageType = shareCard.type
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: JSON.stringify(shareCard),
          message_type: messageType,
        })

        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
      }

      onSuccess?.(conversationId)
      router.push(`/messages/${conversationId}`)
    } catch (error: any) {
      console.error('Open chat error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: targetUserName ? `无法与 ${targetUserName} 私聊，请重试` : '无法发起私聊，请重试',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={loading}
      onClick={handleClick}
    >
      {children ?? t('chatWithAuthor')}
    </Button>
  )
}

