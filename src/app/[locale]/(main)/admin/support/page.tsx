'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, Clock, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function AdminSupportPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useTranslations('support')
  const tCommon = useTranslations('common')

  // Check if user is admin or support
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      return data
    },
    enabled: !!user,
  })

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['allSupportTickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          user:profiles!support_tickets_user_id_fkey(id, username, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    },
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

  if (!user) {
    router.push('/login')
    return null
  }

  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{tCommon('error')}</p>
      </div>
    )
  }

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

  const openTickets = tickets?.filter((t: any) => t.status === 'open') || []
  const inProgressTickets =
    tickets?.filter((t: any) => t.status === 'in_progress') || []
  const resolvedTickets =
    tickets?.filter((t: any) => t.status === 'resolved') || []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('ticketManagement')}</h1>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{tCommon('pending')}</p>
          <p className="text-2xl font-bold">{openTickets.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{tCommon('processing')}</p>
          <p className="text-2xl font-bold">{inProgressTickets.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{tCommon('resolved')}</p>
          <p className="text-2xl font-bold">{resolvedTickets.length}</p>
        </Card>
      </div>

      {/* Tickets List */}
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
                <p className="mb-2 text-sm text-muted-foreground line-clamp-2">
                  {ticket.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>用户: {ticket.user?.display_name || ticket.user?.username}</span>
                  <span>类型: {ticket.ticket_type}</span>
                  <span>优先级: {ticket.priority}</span>
                  <span>
                    {new Date(ticket.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
              <div className="ml-4 flex flex-col gap-2">
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
