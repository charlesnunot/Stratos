'use client'

import { useState } from 'react'
import { useFormatter } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ReportDialog } from '@/components/social/ReportDialog'
import { useAuth } from '@/lib/hooks/useAuth'
import { showInfo } from '@/lib/utils/toast'
import { Flag, MoreVertical } from 'lucide-react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface MessageBubbleProps {
  message: {
    id: string
    content: string
    message_type?: string
    sender_id: string
    created_at: string
    sender?: {
      display_name: string
      avatar_url: string | null
    }
  }
  isOwn: boolean
}

type CardPayload =
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

function safeParseCardPayload(raw: string): CardPayload | null {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const type = (parsed as any).type
    const id = (parsed as any).id
    const url = (parsed as any).url
    if ((type !== 'post' && type !== 'product') || typeof id !== 'string' || typeof url !== 'string') {
      return null
    }
    return parsed as CardPayload
  } catch {
    return null
  }
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const format = useFormatter()
  const { user } = useAuth()
  const [showReportDialog, setShowReportDialog] = useState(false)
  
  const formattedTime = format.dateTime(new Date(message.created_at), {
    hour: 'numeric',
    minute: '2-digit',
  })

  const isCard = message.message_type === 'post' || message.message_type === 'product'
  const cardPayload = isCard ? safeParseCardPayload(message.content) : null

  const handleReport = () => {
    if (!user) {
      showInfo('请先登录后再举报')
      return
    }
    setShowReportDialog(true)
  }

  return (
    <>
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex max-w-[70%] gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          {!isOwn && (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {message.sender?.avatar_url ? (
                <img
                  src={message.sender.avatar_url}
                  alt={message.sender.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs">{message.sender?.display_name?.[0]}</span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Card className={`p-3 min-w-0 ${isOwn ? 'bg-primary text-primary-foreground' : ''}`}>
              {cardPayload ? (
                <Link href={cardPayload.url} className="block">
                  <div className="flex gap-3 min-w-0">
                    {cardPayload.image ? (
                      <img
                        src={cardPayload.image}
                        alt={cardPayload.type === 'post' ? 'Post' : 'Product'}
                        className="h-12 w-12 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className={`h-12 w-12 rounded shrink-0 ${isOwn ? 'bg-primary-foreground/20' : 'bg-muted'}`} />
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${isOwn ? 'text-primary-foreground' : ''}`}>
                        {cardPayload.type === 'product'
                          ? (cardPayload.name || cardPayload.title || '商品')
                          : (cardPayload.title || '帖子')}
                      </p>
                      {cardPayload.type === 'product' && typeof cardPayload.price === 'number' && (
                        <p className={`text-xs mt-0.5 ${isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          ¥{cardPayload.price.toFixed(2)}
                        </p>
                      )}
                      <p className={`text-xs mt-1 truncate ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {cardPayload.url}
                      </p>
                    </div>
                  </div>
                </Link>
              ) : (
                <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
              )}
              <div className="flex items-center justify-between mt-1">
                <p className={`text-xs ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {formattedTime}
                </p>
                {!isOwn && user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 w-6 p-0 ${isOwn ? 'text-primary-foreground/70 hover:text-primary-foreground' : ''}`}
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleReport}>
                        <Flag className="mr-2 h-4 w-4" />
                        举报
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* 举报对话框 */}
      <ReportDialog
        open={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        reportedType="message"
        reportedId={message.id}
      />
    </>
  )
}
