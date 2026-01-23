/**
 * Order dispute API
 * Allows buyers to create disputes and sellers to respond
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

    const { disputeType, reason, evidence } = await request.json()

    if (!disputeType || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, payment_status')
      .eq('id', params.id)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Verify user is buyer or seller
    if (order.buyer_id !== user.id && order.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Check if dispute already exists
    const { data: existingDispute } = await supabase
      .from('order_disputes')
      .select('id')
      .eq('order_id', params.id)
      .in('status', ['pending', 'reviewing'])
      .maybeSingle()

    if (existingDispute) {
      return NextResponse.json(
        { error: 'Dispute already exists for this order' },
        { status: 400 }
      )
    }

    // Create dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('order_disputes')
      .insert({
        order_id: params.id,
        dispute_type: disputeType,
        status: 'pending',
        initiated_by: user.id,
        initiated_by_type: order.buyer_id === user.id ? 'buyer' : 'seller',
        reason: reason,
        evidence: evidence || [],
      })
      .select()
      .single()

    if (disputeError) {
      console.error('Error creating dispute:', disputeError)
      return NextResponse.json(
        { error: `Failed to create dispute: ${disputeError.message}` },
        { status: 500 }
      )
    }

    // Create notification for the other party
    const notifyUserId = order.buyer_id === user.id ? order.seller_id : order.buyer_id
    await supabase.from('notifications').insert({
      user_id: notifyUserId,
      type: 'system',
      title: '订单纠纷',
      content: `订单 ${params.id.substring(0, 8)}... 有新的纠纷申请`,
      related_id: params.id,
      related_type: 'order',
      link: `/orders/${params.id}/dispute`,
    })

    return NextResponse.json({ dispute }, { status: 201 })
  } catch (error: any) {
    console.error('Create dispute error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create dispute' },
      { status: 500 }
    )
  }
}

export async function GET(
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

    // Get dispute details
    const { data: dispute, error: disputeError } = await supabase
      .from('order_disputes')
      .select('*')
      .eq('order_id', params.id)
      .maybeSingle()

    if (disputeError) {
      return NextResponse.json(
        { error: `Failed to fetch dispute: ${disputeError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ dispute })
  } catch (error: any) {
    console.error('Get dispute error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get dispute' },
      { status: 500 }
    )
  }
}
