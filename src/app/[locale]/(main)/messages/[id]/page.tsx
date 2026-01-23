'use client'

import { useParams } from 'next/navigation'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ChatPage() {
  const params = useParams()
  const conversationId = params.id as string
  const { user } = useAuth()
  const supabase = createClient()

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          participant1:profiles!conversations_participant1_id_fkey(id, username, display_name, avatar_url),
          participant2:profiles!conversations_participant2_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('id', conversationId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!conversationId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">对话不存在</p>
        <Link href="/messages">
          <Button variant="outline" className="mt-4">
            返回消息列表
          </Button>
        </Link>
      </div>
    )
  }

  const otherParticipant =
    conversation.participant1_id === user?.id
      ? conversation.participant2
      : conversation.participant1

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Chat Header */}
      <div className="border-b p-4">
        <div className="flex items-center gap-3">
          <Link href="/messages">
            <Button variant="ghost" size="icon">←</Button>
          </Link>
          <Link href={`/profile/${otherParticipant?.id}`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {otherParticipant?.avatar_url ? (
                  <img
                    src={otherParticipant.avatar_url}
                    alt={otherParticipant.display_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{otherParticipant?.display_name?.[0]}</span>
                )}
              </div>
              <div>
                <p className="font-semibold">{otherParticipant?.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  @{otherParticipant?.username}
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 overflow-hidden">
        <ChatWindow conversationId={conversationId} />
      </div>
    </div>
  )
}
