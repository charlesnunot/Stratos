/**
 * Confirm receipt API
 * Allows buyer to confirm receipt of shipped order
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRecoveryOnOrderCompletion } from '@/lib/orders/auto-recovery'

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
      .select('id, buyer_id, seller_id, order_status, order_number')
      .eq('id', params.id)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Verify user is the buyer
    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the buyer can confirm receipt' },
        { status: 403 }
      )
    }

    // Verify order status is shipped
    if (order.order_status !== 'shipped') {
      return NextResponse.json(
        { error: 'Order must be shipped before confirming receipt' },
        { status: 400 }
      )
    }

    // Update order status
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'completed',
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    if (updateError) {
      console.error('[orders/confirm-receipt] Error updating order:', updateError)
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      )
    }

    // Send notification to seller (async, don't block on failure)
    if (order.seller_id) {
      try {
        await supabaseAdmin.from('notifications').insert({
          user_id: order.seller_id,
          type: 'order',
          title: '买家已确认收货',
          content: `订单 ${order.order_number} 的买家已确认收货`,
          related_id: order.id,
          related_type: 'order',
          link: `/orders/${order.id}`,
          actor_id: user.id, // Buyer ID
        })
      } catch (notificationError) {
        // Log error but don't fail the request
        console.error('[orders/confirm-receipt] Failed to send notification:', notificationError)
      }
    }

    // Check and recover seller payment if unfilled orders drop below tier
    // This is async and non-blocking - errors won't affect the main response
    if (order.seller_id) {
      checkRecoveryOnOrderCompletion(order.id, supabaseAdmin).catch((error) => {
        console.error('[orders/confirm-receipt] Auto-recovery check failed:', error)
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Receipt confirmed successfully',
    })
  } catch (error: any) {
    console.error('[orders/confirm-receipt] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm receipt' },
      { status: 500 }
    )
  }
}
