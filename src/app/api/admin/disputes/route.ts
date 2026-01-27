/**
 * Admin disputes management API
 * Allows admins to view and resolve disputes
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { processRefund } from '@/lib/payments/process-refund'

export async function GET(request: NextRequest) {
  try {
    // Unified admin or support check
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { supabase } = authResult.data

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('order_disputes')
      .select(`
        *,
        orders!inner(
          id,
          order_number,
          buyer_id,
          seller_id,
          total_amount,
          currency,
          payment_status,
          order_status,
          profiles!orders_buyer_id_fkey(id, username, display_name),
          profiles!orders_seller_id_fkey(id, username, display_name)
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: disputes, error: disputesError } = await query

    if (disputesError) {
      return NextResponse.json(
        { error: `Failed to fetch disputes: ${disputesError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ disputes: disputes || [] })
  } catch (error: any) {
    console.error('Get disputes error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get disputes' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Unified admin check (only admin can resolve disputes)
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult.data
    const { disputeId, resolution, refundAmount, refundMethod } = await request.json()

    if (!disputeId || !resolution) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Get dispute and order details
    const { data: dispute, error: disputeError } = await supabaseAdmin
      .from('order_disputes')
      .select('*, orders!inner(id, total_amount, currency, seller_id)')
      .eq('id', disputeId)
      .single()

    if (disputeError || !dispute) {
      return NextResponse.json(
        { error: 'Dispute not found' },
        { status: 404 }
      )
    }

    const order = (dispute.orders as any)

    // Update dispute
    await supabaseAdmin
      .from('order_disputes')
      .update({
        status: 'resolved',
        resolution: resolution,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', disputeId)

    // If resolution requires refund
    if (refundAmount && refundAmount > 0) {
      // Check if refund already exists
      const { data: existingRefund } = await supabaseAdmin
        .from('order_refunds')
        .select('id')
        .eq('dispute_id', disputeId)
        .maybeSingle()

      let refundId = existingRefund?.id

      if (!refundId) {
        // Create refund record
        const { data: newRefund, error: refundError } = await supabaseAdmin
          .from('order_refunds')
          .insert({
            order_id: order.id,
            dispute_id: disputeId,
            refund_amount: refundAmount,
            currency: order.currency || 'USD',
            refund_reason: resolution,
            refund_method: refundMethod || 'platform_refund',
            status: 'pending',
          })
          .select()
          .single()

        if (refundError) {
          console.error('Error creating refund:', refundError)
        } else {
          refundId = newRefund.id
        }
      }

      // Process refund
      if (refundId) {
        const refundResult = await processRefund({
          orderId: order.id,
          refundId,
          disputeId,
          amount: refundAmount,
          currency: order.currency || 'USD',
          refundMethod: refundMethod || 'platform_refund',
          supabaseAdmin,
        })

        if (!refundResult.success) {
          console.error('Refund processing failed:', refundResult.error)
        }
      }
    }

    // Notify buyer and seller
    await supabaseAdmin.from('notifications').insert([
      {
        user_id: order.buyer_id,
        type: 'system',
        title: '纠纷已解决',
        content: `您的订单纠纷已由管理员处理：${resolution}`,
        related_id: order.id,
        related_type: 'order',
        link: `/orders/${order.id}/dispute`,
      },
      {
        user_id: order.seller_id,
        type: 'system',
        title: '纠纷已解决',
        content: `订单纠纷已由管理员处理：${resolution}`,
        related_id: order.id,
        related_type: 'order',
        link: `/seller/orders/${order.id}/dispute`,
      },
    ])

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Resolve dispute error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to resolve dispute' },
      { status: 500 }
    )
  }
}
