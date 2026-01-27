/**
 * Admin dispute resolution page
 * Allows admins to view dispute details and make resolution decisions
 * Server Component for authentication, Client Component for interactivity
 */

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { AdminDisputeClient } from './AdminDisputeClient'

export default async function AdminDisputePage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/')
  }

  // Load dispute with order details
  const { data: disputeData, error: disputeError } = await supabase
    .from('order_disputes')
    .select(`
      *,
      orders!inner(
        *,
        buyer:profiles!orders_buyer_id_fkey(id, username, display_name),
        seller:profiles!orders_seller_id_fkey(id, username, display_name)
      )
    `)
    .eq('id', params.id)
    .single()

  if (disputeError || !disputeData) {
    notFound()
  }

  const dispute = disputeData
  const order = disputeData.orders as any

  return (
    <AdminDisputeClient
      disputeId={params.id}
      initialDispute={dispute}
      initialOrder={order}
    />
  )
}
