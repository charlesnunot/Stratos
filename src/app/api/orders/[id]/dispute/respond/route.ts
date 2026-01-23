/**
 * Seller response to dispute API
 * Allows sellers to respond to disputes (agree/refuse/request arbitration)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, response, evidence } = await request.json()

    if (!action || !['agree', 'refuse', 'arbitration'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be agree, refuse, or arbitration' },
        { status: 400 }
      )
    }

    // Get dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('order_disputes')
      .select('*, orders!inner(seller_id, buyer_id)')
      .eq('order_id', params.id)
      .single()

    if (disputeError || !dispute) {
      return NextResponse.json(
        { error: 'Dispute not found' },
        { status: 404 }
      )
    }

    // Verify user is seller
    if ((dispute.orders as any).seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Only seller can respond' },
        { status: 403 }
      )
    }

    // Use admin client for updates
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    if (action === 'agree') {
      // Seller agrees to refund - create refund record
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('total_amount, currency')
        .eq('id', params.id)
        .single()

      if (order) {
        // Create refund record
        await supabaseAdmin.from('order_refunds').insert({
          order_id: params.id,
          dispute_id: dispute.id,
          refund_amount: order.total_amount,
          currency: order.currency || 'USD',
          refund_reason: 'Seller agreed to refund',
          refund_method: 'original_payment',
          status: 'pending',
        })

        // Update dispute status
        await supabaseAdmin
          .from('order_disputes')
          .update({
            seller_response: response || 'Agreed to refund',
            seller_responded_at: new Date().toISOString(),
            status: 'reviewing',
          })
          .eq('id', dispute.id)
      }
    } else if (action === 'refuse') {
      // Seller refuses - update dispute
      await supabaseAdmin
        .from('order_disputes')
        .update({
          seller_response: response || 'Refused refund',
          seller_responded_at: new Date().toISOString(),
          status: 'reviewing', // Move to admin arbitration
        })
        .eq('id', dispute.id)
    } else if (action === 'arbitration') {
      // Request admin arbitration
      await supabaseAdmin
        .from('order_disputes')
        .update({
          seller_response: response || 'Requested admin arbitration',
          seller_responded_at: new Date().toISOString(),
          status: 'reviewing',
        })
        .eq('id', dispute.id)
    }

    // Notify buyer
    await supabaseAdmin.from('notifications').insert({
      user_id: (dispute.orders as any).buyer_id,
      type: 'system',
      title: '卖家已回应纠纷',
      content: `卖家已对订单纠纷做出回应`,
      related_id: params.id,
      related_type: 'order',
      link: `/orders/${params.id}/dispute`,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Dispute response error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to respond to dispute' },
      { status: 500 }
    )
  }
}
