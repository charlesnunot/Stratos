'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, Clock, XCircle, AlertTriangle, ArrowUpCircle } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from '@/lib/hooks/useToast'

interface AdminSupportClientProps {
  userRole: 'admin' | 'support'
}

export function AdminSupportClient({ userRole }: AdminSupportClientProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useTranslations('support')
  const tCommon = useTranslations('common')
  const { toast } = useToast()

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

  // Use API route for assignment (with audit logging)
  const assignTicketMutation = useMutation({
    mutationFn: async ({
      ticketId,
      assignedTo,
    }: {
      ticketId: string
      assignedTo: string | null
    }) => {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to assign ticket')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSupportTickets'] })
      toast({ title: tCommon('success'), description: t('ticketAssigned') })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: tCommon('error'), description: error.message })
    },
  })

  // Use API route for status updates (in_progress, resolved, closed) with audit logging
  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update ticket status')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['allSupportTickets'] })
      const msg = variables.status === 'closed' ? t('ticketClosed') : tCommon('success')
      toast({ title: tCommon('success'), description: msg })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: tCommon('error'), description: error.message })
    },
  })

  // Use API route for escalating tickets (with audit logging)
  const escalateTicketMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to escalate ticket')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSupportTickets'] })
      toast({ title: tCommon('success'), description: t('ticketEscalated') })
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: tCommon('error'), description: error.message })
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

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />
      default:
        return null
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

      <div className="grid gap-4 md:grid-cols-4">
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
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('urgentTickets') || 'Urgent'}</p>
          <p className="text-2xl font-bold text-red-600">
            {tickets?.filter((t: any) => t.priority === 'urgent' && t.status !== 'closed').length ?? 0}
          </p>
        </Card>
      </div>

      <div className="space-y-4">
        {tickets?.map((ticket: any) => (
          <Card key={ticket.id} className={`p-6 ${ticket.priority === 'urgent' ? 'border-red-500 border-2' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  {getPriorityIcon(ticket.priority)}
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
                    {t('userLabel')}: {ticket.user?.display_name || ticket.user?.username}
                  </span>
                  {ticket.assigned_user && (
                    <span>
                      {t('assignedTo')}:{' '}
                      {ticket.assigned_user?.display_name ||
                        ticket.assigned_user?.username}
                    </span>
                  )}
                  <span>{t('ticketType')}: {t(`type_${ticket.ticket_type}`)}</span>
                  <span>{t('priority')}: {t(`priority_${ticket.priority}`)}</span>
                  <span>
                    {new Date(ticket.created_at).toLocaleString()}
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
                      disabled={assignTicketMutation.isPending}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      <option value="unassigned">{t('unassigned')}</option>
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
                    disabled={updateStatusMutation.isPending}
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
                      disabled={updateStatusMutation.isPending}
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
                      disabled={updateStatusMutation.isPending}
                    >
                      {tCommon('close')}
                    </Button>
                  </>
                )}
                {/* Escalate button - available for non-urgent, non-closed tickets */}
                {ticket.status !== 'closed' && ticket.priority !== 'urgent' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => escalateTicketMutation.mutate(ticket.id)}
                    disabled={escalateTicketMutation.isPending}
                    className="text-orange-600 hover:text-orange-700"
                  >
                    <ArrowUpCircle className="mr-1 h-3 w-3" />
                    {t('escalate') || 'Escalate'}
                  </Button>
                )}
                <Link href={`/support/tickets/${ticket.id}`}>
                  <Button size="sm" variant="outline" className="w-full">
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
