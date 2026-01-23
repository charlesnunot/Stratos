/**
 * Seller confirm payment API
 * Allows sellers to confirm they have received payment from buyers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processOrderPayment } from '@/lib/payments/process-order-payment'
import { checkAutoRecovery } from '@/lib/deposits/payment-control'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400 }
      )
    }

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, seller_id, total_amount, payment_status')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Verify seller owns this order
    if (order.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your order' },
        { status: 403 }
      )
    }

    // Check if already paid
    if (order.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Order already confirmed as paid' },
        { status: 400 }
      )
    }

    // Use admin client for processing
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

    // Process order payment (updates status, reduces stock, calculates commissions)
    const result = await processOrderPayment({
      orderId,
      amount: order.total_amount,
      supabaseAdmin,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process payment' },
        { status: 500 }
      )
    }

    // Check if payment can be auto-recovered (if deposit requirement is met)
    await checkAutoRecovery(user.id, supabaseAdmin)

    return NextResponse.json(
      { success: true, message: 'Payment confirmed successfully' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Seller confirm payment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm payment' },
      { status: 500 }
    )
  }
}
