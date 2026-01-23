'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, MessageSquare, CheckCircle, Clock, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function SupportTicketsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const tCommon = useTranslations('common')
  const t = useTranslations('support')

  const { data: tickets, isLoading, refetch } = useQuery({
    queryKey: ['supportTickets', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'closed':
        return <XCircle className="h-4 w-4 text-gray-600" />
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />
    }
  }

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      open: tCommon('pending'),
      in_progress: tCommon('processing'),
      resolved: tCommon('resolved'),
      closed: tCommon('closed'),
    }
    return statusMap[status] || status
  }

  if (!user) {
    router.push('/login')
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('tickets')}</h1>
        <Link href="/support/tickets/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('createTicket')}
          </Button>
        </Link>
      </div>

      {!tickets || tickets.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">{tCommon('noData')}</p>
          <Link href="/support/tickets/create">
            <Button>{t('createTicket')}</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket: any) => (
            <Link key={ticket.id} href={`/support/tickets/${ticket.id}`}>
              <Card className="p-6 hover:bg-accent transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="font-semibold">{ticket.title}</h3>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(ticket.status)}
                        <span className="text-sm text-muted-foreground">
                          {getStatusText(ticket.status)}
                        </span>
                      </div>
                    </div>
                    <p className="mb-2 text-sm text-muted-foreground line-clamp-2">
                      {ticket.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>类型: {ticket.ticket_type}</span>
                      <span>
                        创建时间:{' '}
                        {new Date(ticket.created_at).toLocaleString('zh-CN')}
                      </span>
                      {ticket.updated_at && (
                        <span>
                          更新时间:{' '}
                          {new Date(ticket.updated_at).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
