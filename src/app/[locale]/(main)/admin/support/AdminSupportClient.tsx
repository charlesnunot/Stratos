'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, Clock, XCircle } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

interface AdminSupportClientProps {
  userRole: 'admin' | 'support'
}

export function AdminSupportClient({ userRole }: AdminSupportClientProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useTranslations('support')
  const tCommon = useTranslations('common')

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['allSupportTickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          user:profiles!support_tickets_user_id_fkey(id, username, display_name),
          assigned_user:profiles!support_tickets_assigned_to_fkey(id, username, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    },
    enabled: userRole === 'admin' || userRole === 'support',
  })

  const { data: supportUsers } = useQuery({
    queryKey: ['supportUsers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('role', ['admin', 'support'])
        .order('display_name', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: userRole === 'admin' || userRole === 'support',
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      ticketId,
      status,
    }: {
      ticketId: string
      status: string
    }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', ticketId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSupportTickets'] })
    },
  })

  const assignTicketMutation = useMutation({
    mutationFn: async ({
      ticketId,
      assignedTo,
    }: {
      ticketId: string
      assignedTo: string | null
    }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({
          assigned_to: assignedTo,
          updated_at: new Date().toISOString(),
          ...(assignedTo && { status: 'in_progress' }),
        })
        .eq('id', ticketId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSupportTickets'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('ticketManagement')}</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{tCommon('pending')}</p>
          <p className="text-2xl font-bold">
            {tickets?.filter((t: any) => t.status === 'open').length ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{tCommon('processing')}</p>
          <p className="text-2xl font-bold">
            {tickets?.filter((t: any) => t.status === 'in_progress').length ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{tCommon('resolved')}</p>
          <p className="text-2xl font-bold">
            {tickets?.filter((t: any) => t.status === 'resolved').length ?? 0}
          </p>
        </Card>
      </div>

      <div className="space-y-4">
        {tickets?.map((ticket: any) => (
          <Card key={ticket.id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <Link
                    href={`/support/tickets/${ticket.id}`}
                    className="font-semibold hover:underline"
                  >
                    {ticket.title}
                  </Link>
                  <div className="flex items-center gap-1">
                    {getStatusIcon(ticket.status)}
                    <span className="text-sm text-muted-foreground">
                      {getStatusText(ticket.status)}
                    </span>
                  </div>
                </div>
                <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                  {ticket.description}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    用户: {ticket.user?.display_name || ticket.user?.username}
                  </span>
                  {ticket.assigned_user && (
                    <span>
                      分配给:{' '}
                      {ticket.assigned_user?.display_name ||
                        ticket.assigned_user?.username}
                    </span>
                  )}
                  <span>类型: {ticket.ticket_type}</span>
                  <span>优先级: {ticket.priority}</span>
                  <span>
                    {new Date(ticket.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
              <div className="ml-4 flex min-w-[200px] flex-col gap-2">
                {userRole === 'admin' && supportUsers && (
                  <div className="mb-2">
                    <select
                      value={ticket.assigned_to || 'unassigned'}
                      onChange={(e) =>
                        assignTicketMutation.mutate({
                          ticketId: ticket.id,
                          assignedTo:
                            e.target.value === 'unassigned'
                              ? null
                              : e.target.value,
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="unassigned">未分配</option>
                      {supportUsers.map((supportUser: any) => (
                        <option key={supportUser.id} value={supportUser.id}>
                          {supportUser.display_name || supportUser.username}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {ticket.status === 'open' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        ticketId: ticket.id,
                        status: 'in_progress',
                      })
                    }
                  >
                    {tCommon('processing')}
                  </Button>
                )}
                {ticket.status === 'in_progress' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateStatusMutation.mutate({
                          ticketId: ticket.id,
                          status: 'resolved',
                        })
                      }
                    >
                      {tCommon('resolved')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateStatusMutation.mutate({
                          ticketId: ticket.id,
                          status: 'closed',
                        })
                      }
                    >
                      {tCommon('close')}
                    </Button>
                  </>
                )}
                <Link href={`/support/tickets/${ticket.id}`}>
                  <Button size="sm" variant="outline">
                    {tCommon('view')}
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
