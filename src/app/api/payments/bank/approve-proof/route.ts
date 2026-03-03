import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { processOrderPayment } from '@/lib/payments/process-order-payment'
import { logAudit } from '@/lib/api/audit'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }
    const { user } = authResult.data
    const actorUserId = user.id

    const audit = (
      result: 'success' | 'fail' | 'partial',
      meta?: Record<string, unknown>
    ) => {
      logAudit({
        action: 'bank_proof_review',
        userId: actorUserId,
        resourceId: typeof proofId === 'string' ? proofId : undefined,
        resourceType: 'bank_payment_proof',
        result,
        timestamp: new Date().toISOString(),
        meta,
      })
    }

    const { proofId, approved, reviewNotes } = await request.json()

    if (!proofId || approved === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()

    // Get proof details with payment transaction info
    const { data: proof, error: proofError } = await supabaseAdmin
      .from('bank_payment_proofs')
      .select('*, order_id, payment_transaction_id, payment_transactions(type, related_id, amount, currency, status)')
      .eq('id', proofId)
      .single()

    if (proofError || !proof) {
      audit('fail', { approved, reason: proofError?.message || 'Proof not found' })
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
      audit('fail', { approved, reason: 'Failed to update proof status' })
      return NextResponse.json(
        { error: 'Failed to update proof status' },
        { status: 500 }
      )
    }

    // If approved, process the payment based on transaction type
    if (approved && proof.payment_transaction_id) {
      // Get payment transaction details
      const { data: transaction, error: txError } = await supabaseAdmin
        .from('payment_transactions')
        .select('type, related_id, amount, currency, status')
        .eq('id', proof.payment_transaction_id)
        .single()

      if (!txError && transaction && transaction.status !== 'paid') {
        // Update payment transaction status
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', proof.payment_transaction_id)

        // Handle subscription payment
        if (transaction.type === 'subscription') {
          const subscriptionId = transaction.related_id
          const { activatePendingSubscription } = await import('@/lib/payments/process-subscription-payment')
          const result = await activatePendingSubscription({
            subscriptionId,
            provider: 'bank',
            providerRef: proof.payment_transaction_id,
            paidAmount: parseFloat(String(transaction.amount)),
            currency: transaction.currency || 'CNY',
            supabaseAdmin,
          })

          if (!result.success) {
            if (process.env.NODE_ENV === 'development') {
            console.error('Failed to activate subscription:', result.error);
            }
            audit('partial', {
              approved,
              transactionType: transaction.type,
              reason: result.error || 'Failed to activate subscription',
            })
            return NextResponse.json(
              { 
                success: false, 
                error: result.error || 'Failed to activate subscription',
                message: '凭证审核通过，但订阅激活失败' 
              },
              { status: 500 }
            )
          }

          return NextResponse.json({
            success: true,
            message: '凭证审核通过，订阅已激活',
          })
        }

        // Handle order payment
        if (transaction.type === 'order' && proof.order_id) {
          // Get order details
          const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, total_amount, payment_status')
            .eq('id', proof.order_id)
            .single()

          if (!orderError && order && order.payment_status !== 'paid') {
            // Process order payment using unified service layer
            const result = await processOrderPayment({
              orderId: order.id,
              amount: order.total_amount,
              supabaseAdmin,
            })

            if (!result.success) {
              if (process.env.NODE_ENV === 'development') {
                console.error('Failed to process order payment:', result.error)
              }
              audit('partial', {
                approved,
                transactionType: transaction.type,
                orderId: order.id,
                reason: result.error || 'Failed to process order payment',
              })
              return NextResponse.json(
                {
                  success: false,
                  error: result.error || 'Failed to process order payment',
                  message: '凭证审核通过，但订单支付处理失败',
                },
                { status: 500 }
              )
            }

            // Update order with payment method
            const { error: updateOrderError } = await supabaseAdmin
              .from('orders')
              .update({
                payment_method: 'bank',
                payment_status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', order.id)

            if (updateOrderError) {
              audit('partial', {
                approved,
                transactionType: transaction.type,
                orderId: order.id,
                reason: updateOrderError.message || 'Failed to update order payment status',
              })
              return NextResponse.json(
                {
                  success: false,
                  error: updateOrderError.message || 'Failed to update order payment status',
                  message: '凭证审核通过，但订单支付状态写入失败',
                },
                { status: 500 }
              )
            }
          }
        }
      }
    }

    audit('success', {
      approved,
      hasTransaction: !!proof.payment_transaction_id,
      orderId: proof.order_id,
    })

    return NextResponse.json({
      success: true,
      message: approved ? '凭证审核通过，订单已处理' : '凭证已拒绝',
    })
  } catch (error: unknown) {
    logAudit({
      action: 'bank_proof_review',
      result: 'fail',
      resourceType: 'bank_payment_proof',
      timestamp: new Date().toISOString(),
      meta: { error: error instanceof Error ? error.message : String(error) },
    })

    if (process.env.NODE_ENV === 'development') {
    console.error('Bank proof approval error:', error);
    }

    const message = error instanceof Error ? error.message : 'Failed to approve proof'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
