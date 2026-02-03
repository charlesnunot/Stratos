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
    redirect({ href: `/login?redirect=${encodeURIComponent(`/messages/${id}`)}`, locale })
  }
  const currentUser = user!

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select(`
      id,
      conversation_type,
      name,
      avatar_url,
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

  const isPrivateParticipant =
    conversation.participant1_id === currentUser.id ||
    conversation.participant2_id === currentUser.id

  const isGroup =
    (conversation as { conversation_type?: string }).conversation_type === 'group'

  let groupMembers: Array<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null }> = []
  if (isGroup) {
    const { data: membership } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', id)
      .eq('user_id', currentUser.id)
      .maybeSingle()
    if (!membership) {
      redirect({ href: '/messages', locale })
    }
    const { data: members } = await supabase
      .from('group_members')
      .select(`
        user_id,
        profile:profiles!group_members_user_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('group_id', id)
    if (members?.length) {
      groupMembers = members
        .map((m: any) => m.profile)
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          username: p.username ?? null,
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        }))
    }
  } else if (!isPrivateParticipant) {
    redirect({ href: '/messages', locale })
  }

  type ParticipantProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null }
  const p1 = conversation.participant1 as unknown as ParticipantProfile
  const p2 = conversation.participant2 as unknown as ParticipantProfile
  const conv = conversation as { name?: string | null; avatar_url?: string | null }
  const otherParticipant = isGroup
    ? {
        id: conversation.id,
        username: null as string | null,
        display_name: conv.name ?? 'Group',
        avatar_url: conv.avatar_url ?? null,
      }
    : conversation.participant1_id === currentUser.id
      ? p2
      : p1

  return (
    <ChatPageClient
      conversationId={id}
      isGroup={isGroup}
      groupMembers={groupMembers}
      otherParticipant={{
        id: otherParticipant.id,
        username: otherParticipant.username ?? null,
        display_name: otherParticipant.display_name ?? null,
        avatar_url: otherParticipant.avatar_url ?? null,
      }}
    />
  )
}
