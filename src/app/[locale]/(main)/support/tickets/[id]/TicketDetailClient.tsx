'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'

const REPLY_MAX_LENGTH = 5000

interface TicketDetailClientProps {
  ticketId: string
  initialTicket: any
}

export function TicketDetailClient({ ticketId, initialTicket }: TicketDetailClientProps) {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [replyText, setReplyText] = useState('')
  const t = useTranslations('support')
  const tCommon = useTranslations('common')

  const { data: ticket } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .single()

      if (error) throw error
      return data
    },
    initialData: initialTicket,
    enabled: !!ticketId,
  })

  const { data: replies } = useQuery({
    queryKey: ['ticketReplies', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_ticket_replies')
        .select(`
          *,
          user:profiles!support_ticket_replies_user_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!ticketId,
  })

  const replyMutation = useMutation({
    mutationFn: async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) throw new Error('Reply content is required')
      if (trimmed.length > REPLY_MAX_LENGTH) throw new Error(`Reply must be at most ${REPLY_MAX_LENGTH} characters`)
      const response = await fetch(`/api/support/tickets/${ticketId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || response.statusText)
      }
    },
    onSuccess: () => {
      setReplyText('')
      queryClient.invalidateQueries({ queryKey: ['ticketReplies', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
  })

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = replyText.trim()
    if (!trimmed) return
    if (trimmed.length > REPLY_MAX_LENGTH) return
    replyMutation.mutate(trimmed)
  }

  if (!ticket) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{tCommon('error')}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/support/tickets')}
        >
          {tCommon('back')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{t('ticketDetails')}</h1>
      </div>

      {/* Ticket Info */}
      <Card className="p-6">
        <div className="mb-4">
          <h2 className="mb-2 text-xl font-semibold">{ticket.title}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>{t('ticketType')}: {t(`type_${ticket.ticket_type}`)}</span>
            <span>{t('priority')}: {t(`priority_${ticket.priority}`)}</span>
            <span>{tCommon('status')}: {tCommon(ticket.status === 'in_progress' ? 'processing' : ticket.status)}</span>
            <span>
              {tCommon('createdAt')}:{' '}
              {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>
      </Card>

      {/* Replies */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('reply')}</h2>
        <div className="space-y-4">
          {replies?.map((reply: any) => (
            <div
              key={reply.id}
              className={`rounded-lg p-4 ${
                reply.user_id === user?.id
                  ? 'bg-primary/10 ml-8'
                  : 'bg-muted mr-8'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-semibold">
                  {reply.user?.display_name || reply.user?.username}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(reply.created_at).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{reply.content}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Reply Form */}
      {ticket.status !== 'closed' && (
        <Card className="p-6">
          <form onSubmit={handleReply} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">{t('reply')}</label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('enterReply')}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <Button
              type="submit"
              disabled={replyMutation.isPending || !replyText.trim() || replyText.trim().length > REPLY_MAX_LENGTH}
            >
              {replyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('loading')}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {t('reply')}
                </>
              )}
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
