/**
 * Ship order API
 * Allows seller to mark order as shipped and provide tracking information
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkSellerPermission } from '@/lib/auth/check-subscription'

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

    const body = await request.json()
    const { tracking_number, logistics_provider } = body

    // Validate required fields
    if (!tracking_number || !logistics_provider) {
      return NextResponse.json(
        { error: 'Tracking number and logistics provider are required' },
        { status: 400 }
      )
    }

    // Get Supabase admin client
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

    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, seller_id, order_status, payment_status, order_number, buyer_id')
      .eq('id', params.id)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Verify user is the seller
    if (order.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the seller can ship this order' },
        { status: 403 }
      )
    }

    // Check seller permission (including subscription status)
    const sellerCheck = await checkSellerPermission(user.id, supabaseAdmin)
    if (!sellerCheck.hasPermission) {
      return NextResponse.json(
        { error: sellerCheck.reason || 'Seller subscription required' },
        { status: 403 }
      )
    }

    // Verify order status is paid
    if (order.payment_status !== 'paid' || order.order_status !== 'paid') {
      return NextResponse.json(
        { error: 'Order must be paid before shipping' },
        { status: 400 }
      )
    }

    // Update order status and tracking information
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'shipped',
        tracking_number,
        logistics_provider,
        shipped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    if (updateError) {
      console.error('[orders/ship] Error updating order:', updateError)
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      )
    }

    // Send notification to buyer (async, don't block on failure)
    if (order.buyer_id) {
      try {
        await supabaseAdmin.from('notifications').insert({
          user_id: order.buyer_id,
          type: 'order',
          title: '订单已发货',
          content: `您的订单 ${order.order_number} 已发货，物流单号：${tracking_number}`,
          related_id: order.id,
          related_type: 'order',
          link: `/orders/${order.id}/tracking`,
          actor_id: user.id, // Seller ID
        })
      } catch (notificationError) {
        // Log error but don't fail the request
        console.error('[orders/ship] Failed to send notification:', notificationError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Order shipped successfully',
    })
  } catch (error: any) {
    console.error('[orders/ship] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to ship order' },
      { status: 500 }
    )
  }
}
