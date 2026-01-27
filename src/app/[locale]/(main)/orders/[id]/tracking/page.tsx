import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { OrderTrackingClient } from './OrderTrackingClient'

export default async function OrderTrackingPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=' + encodeURIComponent(`/orders/${params.id}/tracking`))
  }

  // Load order and verify ownership (buyer or seller)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', params.id)
    .single()

  if (orderError || !order) {
    notFound()
  }

  // Verify user is buyer or seller
  const isBuyer = order.buyer_id === user.id
  const isSeller = order.seller_id === user.id

  if (!isBuyer && !isSeller) {
    // Unauthorized: user is neither buyer nor seller
    redirect('/orders')
  }

  return <OrderTrackingClient orderId={params.id} initialOrder={order} />
}
