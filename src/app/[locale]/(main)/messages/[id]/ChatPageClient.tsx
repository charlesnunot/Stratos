'use client'

import { useState } from 'react'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { Users } from 'lucide-react'

export type GroupMember = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface ChatPageClientProps {
  conversationId: string
  isGroup?: boolean
  groupMembers?: GroupMember[]
  otherParticipant: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  }
}

export function ChatPageClient({
  conversationId,
  isGroup = false,
  groupMembers = [],
  otherParticipant,
}: ChatPageClientProps) {
  const [membersExpanded, setMembersExpanded] = useState(false)
  const t = useTranslations('messages')

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-3">
          <Link href="/messages">
            <Button variant="ghost" size="icon">←</Button>
          </Link>
          {isGroup ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                  {otherParticipant.avatar_url ? (
                    <img
                      src={otherParticipant.avatar_url}
                      alt={otherParticipant.display_name || ''}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Users className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">
                    {otherParticipant.display_name || otherParticipant.username || t('groupChat')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {groupMembers.length} {t('members')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMembersExpanded((e) => !e)}
                  className="shrink-0"
                >
                  {membersExpanded ? t('hideMembers') : t('viewMembers')}
                </Button>
              </div>
              {membersExpanded && groupMembers.length > 0 && (
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                  {groupMembers.map((m) => (
                    <Link key={m.id} href={`/profile/${m.id}`}>
                      <div className="flex items-center gap-2 rounded-full bg-muted/80 px-2 py-1.5 hover:bg-muted">
                        <div className="h-6 w-6 rounded-full overflow-hidden bg-background shrink-0">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs flex items-center justify-center h-full">{m.display_name?.[0] || '?'}</span>
                          )}
                        </div>
                        <span className="text-sm truncate max-w-[100px]">
                          {m.display_name || m.username || m.id.slice(0, 8)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link href={`/profile/${otherParticipant.id}`} className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted shrink-0">
                  {otherParticipant.avatar_url ? (
                    <img
                      src={otherParticipant.avatar_url}
                      alt={otherParticipant.display_name || ''}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{otherParticipant.display_name?.[0] || '?'}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {otherParticipant.display_name || otherParticipant.username || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{otherParticipant.username || otherParticipant.id}
                  </p>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatWindow
          conversationId={conversationId}
          isGroup={isGroup}
          groupMembers={groupMembers}
        />
      </div>
    </div>
  )
}
