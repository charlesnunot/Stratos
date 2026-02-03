/**
 * Order dispute API
 * Allows buyers to create disputes and sellers to respond
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
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
      .eq('id', orderId)
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
      .eq('order_id', orderId)
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
        order_id: orderId,
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
      logAudit({
        action: 'dispute_open',
        userId: user.id,
        resourceId: orderId,
        resourceType: 'order',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: disputeError.message },
      })
      return NextResponse.json(
        { error: `Failed to create dispute: ${disputeError.message}` },
        { status: 500 }
      )
    }

    // Create notification for the other party (use admin to bypass RLS: user can only insert for self)
    const notifyUserId = order.buyer_id === user.id ? order.seller_id : order.buyer_id
    const admin = await getSupabaseAdmin()
    await admin.from('notifications').insert({
      user_id: notifyUserId,
      type: 'system',
      title: 'Order Dispute',
      content: `A new dispute has been opened for order ${orderId.substring(0, 8)}...`,
      related_id: orderId,
      related_type: 'order',
      link: `/orders/${orderId}/dispute`,
      content_key: 'dispute_created',
      content_params: { orderIdPrefix: orderId.substring(0, 8) },
    })

    logAudit({
      action: 'dispute_open',
      userId: user.id,
      resourceId: orderId,
      resourceType: 'order',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { disputeId: dispute.id },
    })

    return NextResponse.json({ dispute }, { status: 201 })
  } catch (err: unknown) {
    console.error('Create dispute error:', err)
    const message = err instanceof Error ? err.message : 'Failed to create dispute'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
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
      .eq('order_id', orderId)
      .maybeSingle()

    if (disputeError) {
      return NextResponse.json(
        { error: `Failed to fetch dispute: ${disputeError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ dispute })
  } catch (err: unknown) {
    console.error('Get dispute error:', err)
    const message = err instanceof Error ? err.message : 'Failed to get dispute'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
