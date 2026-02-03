/**
 * API endpoint for fetching subscription history
 * Returns all subscriptions (active, expired, cancelled) for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all subscriptions for the user, ordered by created_at descending
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (subscriptionsError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching subscription history:', subscriptionsError)
      }
      return NextResponse.json(
        { error: subscriptionsError.message || 'Failed to fetch subscription history' },
        { status: 500 }
      )
    }

    // Get payment transactions for subscriptions
    const subscriptionIds = subscriptions?.map((s) => s.id) || []
    let paymentTransactions: any[] = []

    if (subscriptionIds.length > 0) {
      const { data: transactions, error: transactionsError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('type', 'subscription')
        .in('related_id', subscriptionIds)
        .order('created_at', { ascending: false })

      if (!transactionsError && transactions) {
        paymentTransactions = transactions
      }
    }

    // Combine subscriptions with their payment transactions
    const subscriptionsWithPayments = (subscriptions || []).map((subscription) => {
      const payment = paymentTransactions.find(
        (t) => t.related_id === subscription.id
      )
      return {
        ...subscription,
        payment: payment || null,
      }
    })

    // Calculate statistics
    const stats = {
      total: subscriptions?.length || 0,
      active: subscriptions?.filter((s) => s.status === 'active' && new Date(s.expires_at) > new Date()).length || 0,
      expired: subscriptions?.filter((s) => s.status === 'expired' || new Date(s.expires_at) <= new Date()).length || 0,
      cancelled: subscriptions?.filter((s) => s.status === 'cancelled').length || 0,
      totalSpent: subscriptions?.reduce((sum, s) => sum + (parseFloat(String(s.amount)) || 0), 0) || 0,
    }

    return NextResponse.json({
      success: true,
      subscriptions: subscriptionsWithPayments,
      stats,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Subscription history error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch subscription history'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
