import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { redirect } from '@/i18n/navigation'
import { ChatPageClient } from './ChatPageClient'

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id, locale } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/messages/${id}`)}`)
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select(`
      id,
      participant1_id,
      participant2_id,
      participant1:profiles!conversations_participant1_id_fkey(id, username, display_name, avatar_url),
      participant2:profiles!conversations_participant2_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq('id', id)
    .single()

  if (error || !conversation) {
    notFound()
  }

  const isParticipant =
    conversation.participant1_id === user.id ||
    conversation.participant2_id === user.id

  if (!isParticipant) {
    redirect('/messages')
  }

  const otherParticipant =
    conversation.participant1_id === user.id
      ? (conversation.participant2 as { id: string; username: string | null; display_name: string | null; avatar_url: string | null })
      : (conversation.participant1 as { id: string; username: string | null; display_name: string | null; avatar_url: string | null })

  return (
    <ChatPageClient
      conversationId={id}
      otherParticipant={{
        id: otherParticipant.id,
        username: otherParticipant.username ?? null,
        display_name: otherParticipant.display_name ?? null,
        avatar_url: otherParticipant.avatar_url ?? null,
      }}
    />
  )
}
