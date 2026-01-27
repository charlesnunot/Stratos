/**
 * Admin order monitoring and dispute management page
 * Allows admins to view all orders, disputes, and manage refunds
 * Server Component for authentication, Client Component for interactivity
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminOrdersClient } from './AdminOrdersClient'

export default async function AdminOrdersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is admin or support
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/')
  }

  // Load orders and disputes
  const [ordersResult, disputesResult] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        *,
        buyer:profiles!orders_buyer_id_fkey(id, username, display_name),
        seller:profiles!orders_seller_id_fkey(id, username, display_name),
        disputes:order_disputes(id, dispute_type, status, reason)
      `)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('order_disputes')
      .select(`
        *,
        orders!inner(
          order_number,
          total_amount,
          currency,
          buyer:profiles!orders_buyer_id_fkey(id, username, display_name),
          seller:profiles!orders_seller_id_fkey(id, username, display_name)
        )
      `)
      .in('status', ['pending', 'reviewing'])
      .order('created_at', { ascending: false }),
  ])

  const orders = (ordersResult.data as any) || []
  const disputes = (disputesResult.data as any) || []

  return <AdminOrdersClient initialOrders={orders} initialDisputes={disputes} />
}
