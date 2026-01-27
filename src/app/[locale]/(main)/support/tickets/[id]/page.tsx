import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TicketDetailClient } from './TicketDetailClient'

export default async function TicketDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=' + encodeURIComponent(`/support/tickets/${params.id}`))
  }

  // Load ticket and verify ownership
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', params.id)
    .single()

  if (ticketError || !ticket) {
    notFound()
  }

  // Check if user owns the ticket or is admin/support
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdminOrSupport = profile?.role === 'admin' || profile?.role === 'support'
  const isOwner = ticket.user_id === user.id

  if (!isOwner && !isAdminOrSupport) {
    // Unauthorized: user doesn't own the ticket and is not admin/support
    redirect('/support/tickets')
  }

  return <TicketDetailClient ticketId={params.id} initialTicket={ticket} />
}
