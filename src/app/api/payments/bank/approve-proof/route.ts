import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processOrderPayment } from '@/lib/payments/process-order-payment'

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

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin' && profile?.role !== 'support') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      )
    }

    const { proofId, approved, reviewNotes } = await request.json()

    if (!proofId || approved === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Use service role client for admin operations
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

    // Get proof details
    const { data: proof, error: proofError } = await supabaseAdmin
      .from('bank_payment_proofs')
      .select('*, order_id, payment_transaction_id')
      .eq('id', proofId)
      .single()

    if (proofError || !proof) {
      return NextResponse.json(
        { error: 'Proof not found' },
        { status: 404 }
      )
    }

    // Update proof status
    const { error: updateError } = await supabaseAdmin
      .from('bank_payment_proofs')
      .update({
        status: approved ? 'approved' : 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes || null,
      })
      .eq('id', proofId)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update proof status' },
        { status: 500 }
      )
    }

    // If approved, process the order payment
    if (approved && proof.order_id) {
      // Get order details
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('id, total_amount, payment_status')
        .eq('id', proof.order_id)
        .single()

      if (!orderError && order && order.payment_status !== 'paid') {
        // Update payment transaction
        if (proof.payment_transaction_id) {
          await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .eq('id', proof.payment_transaction_id)
        }

        // Process order payment using unified service layer
        const result = await processOrderPayment({
          orderId: order.id,
          amount: order.total_amount,
          supabaseAdmin,
        })

        if (!result.success) {
          console.error('Failed to process order payment:', result.error)
        }

        // Update order with payment method
        await supabaseAdmin
          .from('orders')
          .update({
            payment_method: 'bank',
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', order.id)
      }
    }

    return NextResponse.json({
      success: true,
      message: approved ? '凭证审核通过，订单已处理' : '凭证已拒绝',
    })
  } catch (error: any) {
    console.error('Bank proof approval error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to approve proof' },
      { status: 500 }
    )
  }
}
