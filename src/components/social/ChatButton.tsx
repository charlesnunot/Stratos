'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { openChat } from '@/lib/chat/ChatNavigationService'
import { getOrCreateConversationCore } from '@/lib/chat/getOrCreateConversationCore'

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
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('messages')
  const tCommon = useTranslations('common')
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!user) {
      toast({
        variant: 'warning',
        title: tCommon('notice'),
        description: t('loginToChat'),
      })
      return
    }

    if (!targetUserId) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('cannotGetTargetUser'),
      })
      return
    }

    if (targetUserId === user.id) {
      toast({
        variant: 'info',
        title: tCommon('notice'),
        description: t('cannotChatWithSelf'),
      })
      return
    }

    setLoading(true)
    try {
      await openChat(
        {
          targetUserId,
          shareCard,
          onSuccess,
        },
        {
          getConversationId: (tid) =>
            getOrCreateConversationCore(supabase, user.id, tid),
          navigate: (path) => router.push(path),
          invalidateConversations: () => {
            queryClient.invalidateQueries({
              queryKey: ['conversations', user.id],
            })
            queryClient.invalidateQueries({
              queryKey: ['conversationDetails', user.id],
            })
          },
        }
      )
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string }
      const isAbortError =
        err?.name === 'AbortError' ||
        err?.message?.includes('aborted') ||
        err?.message?.includes('cancelled') ||
        err?.message === 'signal is aborted without reason'

      if (isAbortError) return

      const errorMessage = err?.message || t('unknownError')
      const description = targetUserName
        ? t('chatFailedWithUser', { user: targetUserName, error: errorMessage })
        : t('chatFailed', { error: errorMessage })

      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description,
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
      {loading ? t('openingChat') : (children ?? t('chatWithAuthor'))}
    </Button>
  )
}
