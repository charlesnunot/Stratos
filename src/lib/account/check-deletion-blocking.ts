/**
 * Pre-check for account deletion: orders, deposits, commissions, debts, disputes, tickets, subscriptions.
 * Used when user submits deletion request; result stored in blocking_summary for admin review.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface BlockingSummary {
  unfulfilled_orders_as_seller: number
  unfulfilled_orders_as_buyer: number
  deposit_lots_held: boolean
  pending_commissions_count: number
  pending_commissions_amount?: number
  seller_debts: boolean
  open_disputes: number
  open_tickets: number
  active_subscriptions: number
}

export interface CheckDeletionBlockingResult {
  hasBlocking: boolean
  blockingSummary: BlockingSummary
}

const EMPTY_SUMMARY: BlockingSummary = {
  unfulfilled_orders_as_seller: 0,
  unfulfilled_orders_as_buyer: 0,
  deposit_lots_held: false,
  pending_commissions_count: 0,
  seller_debts: false,
  open_disputes: 0,
  open_tickets: 0,
  active_subscriptions: 0,
}

export async function checkDeletionBlocking(
  supabase: SupabaseClient,
  userId: string
): Promise<CheckDeletionBlockingResult> {
  const summary: BlockingSummary = { ...EMPTY_SUMMARY }

  const [
    ordersAsSellerRes,
    ordersAsBuyerRes,
    depositLotsRes,
    commissionsRes,
    debtsRes,
    disputesRes,
    ticketsRes,
    subscriptionsRes,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('payment_status', 'paid')
      .in('order_status', ['pending', 'paid', 'shipped']),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', userId)
      .in('order_status', ['pending', 'paid', 'shipped']),
    supabase
      .from('seller_deposit_lots')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .in('status', ['held', 'refundable', 'refunding']),
    supabase
      .from('affiliate_commissions')
      .select('id, amount')
      .eq('affiliate_id', userId)
      .eq('status', 'pending'),
    supabase
      .from('seller_debts')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('status', 'pending'),
    supabase
      .from('order_disputes')
      .select('id, order_id, initiated_by')
      .in('status', ['pending', 'reviewing']),
    supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['open', 'in_progress']),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString()),
  ])

  summary.unfulfilled_orders_as_seller = ordersAsSellerRes.count ?? 0
  summary.unfulfilled_orders_as_buyer = ordersAsBuyerRes.count ?? 0
  summary.deposit_lots_held = (depositLotsRes.count ?? 0) > 0
  summary.seller_debts = (debtsRes.count ?? 0) > 0
  summary.open_tickets = ticketsRes.count ?? 0
  summary.active_subscriptions = subscriptionsRes.count ?? 0

  const commissions = commissionsRes.data ?? []
  summary.pending_commissions_count = commissions.length
  summary.pending_commissions_amount = commissions.reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0
  )

  const disputes = disputesRes.data ?? []
  if (disputes.length === 0) {
    summary.open_disputes = 0
  } else {
    const orderIds = [...new Set(disputes.map((d) => d.order_id))]
    const { data: orders } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id')
      .in('id', orderIds)
    const orderMap = new Map((orders ?? []).map((o) => [o.id, o]))
    let userDisputeCount = 0
    for (const d of disputes) {
      if ((d as { initiated_by?: string }).initiated_by === userId) {
        userDisputeCount++
        continue
      }
      const order = orderMap.get(d.order_id)
      if (!order) continue
      if (order.buyer_id === userId || order.seller_id === userId) userDisputeCount++
    }
    summary.open_disputes = userDisputeCount
  }

  const hasBlocking =
    summary.unfulfilled_orders_as_seller > 0 ||
    summary.unfulfilled_orders_as_buyer > 0 ||
    summary.deposit_lots_held ||
    summary.pending_commissions_count > 0 ||
    summary.seller_debts ||
    summary.open_disputes > 0 ||
    summary.open_tickets > 0 ||
    summary.active_subscriptions > 0

  return { hasBlocking, blockingSummary: summary }
}
