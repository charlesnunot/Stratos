'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
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
    console.log('ChatButton clicked', { targetUserId, user: user?.id })
    
    if (!user) {
      toast({
        variant: 'warning',
        title: '提示',
        description: '请先登录后再私聊',
      })
      return
    }

    if (!targetUserId) {
      console.warn('ChatButton: targetUserId is missing')
      toast({
        variant: 'destructive',
        title: '错误',
        description: '无法获取目标用户信息',
      })
      return
    }

    if (targetUserId === user.id) {
      toast({
        variant: 'info',
        title: '提示',
        description: '不能与自己私聊',
      })
      return
    }

    setLoading(true)
    try {
      console.log('ChatButton: Getting or creating conversation', { targetUserId })
      const conversationId = await getOrCreateConversation(targetUserId)
      console.log('ChatButton: Conversation ID', conversationId)

      // 可选：先发送卡片（不依赖 chat 页面解析参数）
      // 为了加快跳转，这里改为 fire-and-forget，不阻塞导航
      if (shareCard) {
        ;(async () => {
          console.log('ChatButton: Sending share card', shareCard)
          const messageType = shareCard.type
          
          try {
            const { error: insertError } = await supabase.from('messages').insert({
              conversation_id: conversationId,
              sender_id: user.id,
              content: JSON.stringify(shareCard),
              message_type: messageType,
            })

            if (insertError) {
              console.error('ChatButton: Failed to insert message', insertError)
              return
            }

            const { error: updateError } = await supabase
              .from('conversations')
              .update({
                last_message_at: new Date().toISOString(),
              })
              .eq('id', conversationId)

            if (updateError) {
              console.error('ChatButton: Failed to update conversation', updateError)
            }
          } catch (shareError: any) {
            const isAbortError = 
              shareError?.name === 'AbortError' ||
              shareError?.message?.includes('aborted') ||
              shareError?.message?.includes('cancelled') ||
              shareError?.message === 'signal is aborted without reason'
            
            if (!isAbortError) {
              console.error('ChatButton: Error sending share card', shareError)
            }
          }
        })()
      }

      onSuccess?.(conversationId)
      console.log('ChatButton: Navigating to', `/messages/${conversationId}`)
      router.push(`/messages/${conversationId}`)
    } catch (error: any) {
      // 检查是否是 AbortError
      const isAbortError = 
        error?.name === 'AbortError' ||
        error?.message?.includes('aborted') ||
        error?.message?.includes('cancelled') ||
        error?.message === 'signal is aborted without reason'
      
      if (isAbortError) {
        // 静默处理 AbortError，不显示错误提示
        console.log('ChatButton: Request was aborted (this is normal)')
        return
      }
      
      console.error('ChatButton: Open chat error:', error)
      const errorMessage = error?.message || '未知错误'
      toast({
        variant: 'destructive',
        title: '错误',
        description: targetUserName 
          ? `无法与 ${targetUserName} 私聊: ${errorMessage}` 
          : `无法发起私聊: ${errorMessage}`,
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
      {loading ? (
        <>
          <span className="mr-2">...</span>
          {children ?? t('chatWithAuthor')}
        </>
      ) : (
        children ?? t('chatWithAuthor')
      )}
    </Button>
  )
}

