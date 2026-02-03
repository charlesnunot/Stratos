'use client'

import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, MessageCircle, Users } from 'lucide-react'
import { CreateConversation } from './CreateConversation'
import { CreateGroup } from './CreateGroup'
import { useTranslations } from 'next-intl'

export function ChatList() {
  const { user } = useAuth()
  const supabase = createClient()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const t = useTranslations('messages')
  const tCommon = useTranslations('common')

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      if (!user) return []
      // Get private conversations
      const { data: privateConvs, error: privateError } = await supabase
        .from('conversations')
        .select(`
          *,
          participant1:profiles!conversations_participant1_id_fkey(id, username, display_name, avatar_url),
          participant2:profiles!conversations_participant2_id_fkey(id, username, display_name, avatar_url)
        `)
        .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
        .eq('conversation_type', 'private')
        .order('last_message_at', { ascending: false })

      // Get group conversations
      const { data: groupConvs } = await supabase
        .from('group_members')
        .select(`
          group:conversations!group_members_group_id_fkey(
            id,
            name,
            avatar_url,
            owner_id,
            conversation_type,
            last_message_at,
            created_at
          )
        `)
        .eq('user_id', user.id)

      const groups = groupConvs?.map((item: any) => item.group).filter(Boolean) || []
      
      // Combine and sort
      const allConvs = [...(privateConvs || []), ...groups].sort((a, b) => {
        const aTime = new Date(a.last_message_at || a.created_at || 0).getTime()
        const bTime = new Date(b.last_message_at || b.created_at || 0).getTime()
        return bTime - aTime
      })

      if (privateError) throw privateError
      return allConvs
    },
    enabled: !!user,
  })

  // Get unread counts and last messages for each conversation
  type LastMessageRecord = { created_at?: string; content?: string }
  const { data: conversationDetails } = useQuery<{
    unreadCounts: Record<string, number>
    lastMessages: Record<string, LastMessageRecord | null>
  }>({
    queryKey: ['conversationDetails', user?.id, conversations.length],
    queryFn: async () => {
      if (!user || conversations.length === 0) return { unreadCounts: {}, lastMessages: {} }
      
      const conversationIds = conversations.map((c: any) => c.id)
      
      // Get unread counts
      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('is_read', false)
        .neq('sender_id', user.id)
        .in('conversation_id', conversationIds)

      const unreadCounts: Record<string, number> = {}
      unreadMessages?.forEach((msg: any) => {
        unreadCounts[msg.conversation_id] = (unreadCounts[msg.conversation_id] || 0) + 1
      })

      // Get last messages
      const lastMessages: Record<string, any> = {}
      for (const convId of conversationIds) {
        const { data } = await supabase
          .from('messages')
          .select('id, content, created_at, sender_id')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        if (data) {
          lastMessages[convId] = data
        }
      }

      return { unreadCounts, lastMessages }
    },
    enabled: !!user && conversations.length > 0,
  })

  const unreadCounts = conversationDetails?.unreadCounts ?? {}
  const lastMessages = conversationDetails?.lastMessages ?? {}

  const getOtherParticipant = (conversation: any) => {
    if (conversation.participant1_id === user?.id) {
      return conversation.participant2
    }
    return conversation.participant1
  }

  const formatLastMessage = (message: any) => {
    if (!message) return t('noMessages')
    const content = message.content || ''
    if (!content.trim()) return t('noMessages')
    // 分享的帖子/商品：content 为 JSON，显示友好预览而非原始 JSON
    try {
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && (parsed.type === 'product' || parsed.type === 'post')) {
        if (parsed.type === 'product') {
          const name = parsed.name || parsed.title
          return name ? t('sharedProductPreviewWithName', { name }) : t('sharedProductPreview')
        }
        if (parsed.type === 'post') {
          const title = parsed.title
          return title ? t('sharedPostPreviewWithTitle', { title }) : t('sharedPostPreview')
        }
      }
    } catch {
      // 非 JSON，按普通文本处理
    }
    return content.length > 30 ? content.substring(0, 30) + '...' : content
  }

  if (isLoading) {
    return <div className="text-center text-sm text-muted-foreground">{tCommon('loading')}</div>
  }

  return (
    <div className="space-y-2">
      <div className="mb-4 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('startNewConversation')}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setShowCreateGroup(true)}
        >
          <Users className="mr-2 h-4 w-4" />
          {t('createGroup')}
        </Button>
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md">
            <CreateConversation onClose={() => setShowCreateDialog(false)} />
          </div>
        </div>
      )}

      {showCreateGroup && (
        <CreateGroup onClose={() => setShowCreateGroup(false)} />
      )}

      {conversations.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t('noConversations')}</p>
        </Card>
      ) : (
        conversations.map((conversation: any) => {
          const isGroup = conversation.conversation_type === 'group'
          const other = isGroup ? null : getOtherParticipant(conversation)
          const unreadCount = unreadCounts[conversation.id] || 0
          const lastMessage = lastMessages[conversation.id]

          return (
            <Link key={conversation.id} href={`/messages/${conversation.id}`}>
              <Card className="p-4 hover:bg-accent transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 flex-shrink-0">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {isGroup ? (
                        conversation.avatar_url ? (
                          <img
                            src={conversation.avatar_url}
                            alt={conversation.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Users className="h-6 w-6 text-muted-foreground" />
                        )
                      ) : other?.avatar_url ? (
                        <img
                          src={other.avatar_url}
                          alt={other.display_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm">
                          {other?.display_name?.[0] || '?'}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold truncate">
                        {isGroup
                          ? conversation.name || t('unnamedGroup')
                          : other?.display_name || other?.username || t('unknownUser')}
                      </p>
                      {lastMessage ? (
                        <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {new Date(lastMessage.created_at ?? 0).toLocaleDateString('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {formatLastMessage(lastMessage)}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })
      )}
    </div>
  )
}
