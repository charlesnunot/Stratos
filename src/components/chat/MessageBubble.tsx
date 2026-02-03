'use client'

import { useState, type ReactNode } from 'react'
import { useFormatter } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ReportDialog } from '@/components/social/ReportDialog'
import { useAuth } from '@/lib/hooks/useAuth'
import { showInfo, showError } from '@/lib/utils/toast'
import { useTranslations, useLocale } from 'next-intl'
import { useAiTask } from '@/lib/ai/useAiTask'
import { Flag, MoreVertical, Languages } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type GroupMemberForBubble = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url?: string | null
}

interface MessageBubbleProps {
  message: {
    id: string
    content: string
    /** DB column is message_type (snake_case); Realtime/API may return messageType (camelCase) */
    message_type?: string
    messageType?: string
    sender_id: string
    created_at: string
    sender?: {
      display_name: string
      avatar_url: string | null
    }
  }
  isOwn: boolean
  /** For group chat: used to render @username as profile links */
  groupMembers?: GroupMemberForBubble[]
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

const MENTION_REGEX = /@([\w.-]+)/g

function renderTextWithMentions(
  content: string,
  groupMembers: GroupMemberForBubble[] | undefined,
  isOwn: boolean
): ReactNode {
  if (!groupMembers?.length) {
    return content
  }
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  MENTION_REGEX.lastIndex = 0
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    const username = match[1]
    const member = groupMembers.find((m) => m.username === username || m.display_name === username)
    if (member) {
      parts.push(
        <Link
          key={match.index}
          href={`/profile/${member.id}`}
          className={isOwn ? 'underline text-primary-foreground/90' : 'underline text-primary'}
        >
          @{username}
        </Link>
      )
    } else {
      parts.push('@' + username)
    }
    lastIndex = MENTION_REGEX.lastIndex
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  return parts.length ? parts : content
}

export function MessageBubble({ message, isOwn, groupMembers }: MessageBubbleProps) {
  const format = useFormatter()
  const { user } = useAuth()
  const tAi = useTranslations('ai')
  const tMessages = useTranslations('messages')
  const locale = useLocale()
  const { runTask, loading: translateLoading } = useAiTask()
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [translatedText, setTranslatedText] = useState<string | null>(null)
  const [showTranslated, setShowTranslated] = useState(false)
  
  const formattedTime = format.dateTime(new Date(message.created_at), {
    hour: 'numeric',
    minute: '2-digit',
  })

  const msgType = (message.message_type ?? message.messageType ?? 'text') as string
  const isCard = msgType === 'post' || msgType === 'product'
  const cardPayload = isCard ? safeParseCardPayload(message.content) : null
  const looksLikeImageUrl = (s: string) => {
    const t = (s ?? '').trim()
    if (!t || /\s/.test(t)) return false
    try {
      const u = new URL(t)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  }
  const isImage =
    msgType === 'image' ||
    ((msgType === 'text' || msgType === '') &&
      looksLikeImageUrl(message.content ?? '') &&
      !cardPayload)

  const handleReport = () => {
    if (!user) {
      showInfo(tMessages('loginToReport'))
      return
    }
    setShowReportDialog(true)
  }

  return (
    <>
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex max-w-[85%] sm:max-w-[70%] gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
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
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <Card className={`p-3 min-w-0 w-full ${isOwn ? 'bg-primary text-primary-foreground' : ''}`}>
              {cardPayload ? (
                <Link href={cardPayload.url} className="block w-full">
                  <div className="flex gap-3 min-w-0 w-full">
                    {cardPayload.image ? (
                      <img
                        src={cardPayload.image}
                        alt={cardPayload.type === 'post' ? 'Post' : 'Product'}
                        className="h-12 w-12 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className={`h-12 w-12 rounded shrink-0 ${isOwn ? 'bg-primary-foreground/20' : 'bg-muted'}`} />
                    )}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className={`text-sm font-semibold break-words line-clamp-2 ${isOwn ? 'text-primary-foreground' : ''}`}>
                        {cardPayload.type === 'product'
                          ? (cardPayload.name || cardPayload.title || '商品')
                          : (cardPayload.title || '帖子')}
                      </p>
                      {cardPayload.type === 'product' && typeof cardPayload.price === 'number' && (
                        <p className={`text-xs mt-0.5 ${isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          ¥{cardPayload.price.toFixed(2)}
                        </p>
                      )}
                      <p className={`text-xs mt-1 break-all ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'} hidden sm:block`}>
                        {cardPayload.url}
                      </p>
                    </div>
                  </div>
                </Link>
              ) : isImage ? (
                <a
                  href={message.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded overflow-hidden max-w-full"
                >
                  <img
                    src={message.content}
                    alt=""
                    className="max-h-64 max-w-full rounded object-contain"
                  />
                </a>
              ) : (
                <>
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {showTranslated && translatedText
                      ? translatedText
                      : groupMembers?.length
                        ? renderTextWithMentions(message.content ?? '', groupMembers, isOwn)
                        : message.content}
                  </p>
                  {translatedText && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`mt-1 h-6 text-xs ${isOwn ? 'text-primary-foreground/70 hover:text-primary-foreground' : ''}`}
                      onClick={() => setShowTranslated((s) => !s)}
                    >
                      {showTranslated ? tAi('showOriginal') : tAi('showTranslation')}
                    </Button>
                  )}
                </>
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
                      {!isCard && !isImage && message.content?.trim() && (
                        <DropdownMenuItem
                          disabled={translateLoading}
                          onClick={async () => {
                            try {
                              const targetLang = locale === 'zh' ? 'English' : '中文'
                              const { result } = await runTask({
                                task: 'translate_message',
                                input: message.content,
                                targetLanguage: targetLang,
                              })
                              if (result?.trim()) {
                                setTranslatedText(result.trim())
                                setShowTranslated(true)
                              }
                            } catch (e) {
                              const msg = e instanceof Error ? e.message : ''
                              if (msg === 'TRANSLATION_LIMIT') {
                                showError(tAi('translationLimitReached'))
                              } else {
                                showError(tAi('failed'))
                              }
                            }
                          }}
                        >
                          <Languages className="mr-2 h-4 w-4" />
                          {translateLoading ? tAi('loading') : tAi('translate')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={handleReport}>
                        <Flag className="mr-2 h-4 w-4" />
                        {tMessages('report')}
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
