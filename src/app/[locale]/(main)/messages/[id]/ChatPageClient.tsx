'use client'

import { ChatWindow } from '@/components/chat/ChatWindow'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'

interface ChatPageClientProps {
  conversationId: string
  otherParticipant: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  }
}

export function ChatPageClient({
  conversationId,
  otherParticipant,
}: ChatPageClientProps) {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-3">
          <Link href="/messages">
            <Button variant="ghost" size="icon">←</Button>
          </Link>
          <Link href={`/profile/${otherParticipant.id}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted">
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
              <div>
                <p className="font-semibold">
                  {otherParticipant.display_name || otherParticipant.username || 'User'}
                </p>
                <p className="text-xs text-muted-foreground">
                  @{otherParticipant.username || otherParticipant.id}
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatWindow conversationId={conversationId} />
      </div>
    </div>
  )
}
