import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Initialize bank transfer payment
 * Creates payment transaction and updates order with bank payment method
 * This should be called before showing bank account info to buyer
 */
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

    // Verify order exists and belongs to current user
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, seller_id, total_amount, payment_status, payment_method')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Critical: Verify buyer identity
    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: This order does not belong to you' },
        { status: 403 }
      )
    }

    // Check if order is already paid
    if (order.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Order already paid' },
        { status: 400 }
      )
    }

    // Fetch bank account information
    const { data: bankInfo, error: bankError } = await supabase
      .from('bank_account_settings')
      .select('*')
      .eq('is_active', true)
      .single()

    if (bankError || !bankInfo) {
      return NextResponse.json(
        { error: 'Bank account information not configured' },
        { status: 500 }
      )
    }

    // Use admin client for creating payment transaction and updating order
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

    // Create payment transaction
    const providerRef = `bank_${orderId}_${Date.now()}`
    const { data: paymentTransaction, error: transactionError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        type: 'order',
        provider: 'bank',
        provider_ref: providerRef,
        amount: order.total_amount,
        currency: 'CNY',
        status: 'pending',
        related_id: orderId,
      })
      .select()
      .single()

    if (transactionError) {
      console.error('Error creating payment transaction:', transactionError)
      return NextResponse.json(
        { error: 'Failed to create payment transaction' },
        { status: 500 }
      )
    }

    // Update order with payment method
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_method: 'bank',
        payment_status: 'pending', // Manual verification needed
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Error updating order:', updateError)
      // Try to rollback payment transaction
      await supabaseAdmin
        .from('payment_transactions')
        .delete()
        .eq('id', paymentTransaction.id)
      
      return NextResponse.json(
        { error: 'Failed to update order' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      bankAccountInfo: bankInfo,
      paymentTransactionId: paymentTransaction.id,
    })
  } catch (error: any) {
    console.error('Bank transfer init error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to initialize bank transfer' },
      { status: 500 }
    )
  }
}
