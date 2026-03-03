import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { processRefundWithFallback } from '@/lib/payments/process-refund-with-fallback'
import { logAudit } from '@/lib/api/audit'

type RefundStatus = 'pending' | 'processing' | 'approved' | 'completed' | 'failed'

function toAmount(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : NaN
}

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

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const refundAmount = toAmount(body.refund_amount)
    const rawReason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const refundReason = rawReason.length > 0 ? rawReason.slice(0, 500) : 'Seller initiated refund'

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return NextResponse.json({ error: 'Invalid refund amount' }, { status: 400 })
    }

    const supabaseAdmin = await getSupabaseAdmin()

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(
        'id, seller_id, buyer_id, order_number, order_status, payment_status, total_amount, currency'
      )
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.seller_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (order.order_status === 'cancelled' || order.order_status === 'refunded') {
      return NextResponse.json(
        { error: 'Order is not refundable in current status' },
        { status: 400 }
      )
    }

    if (order.payment_status !== 'paid' && order.payment_status !== 'partially_refunded') {
      return NextResponse.json(
        { error: 'Only paid or partially refunded orders can be refunded' },
        { status: 400 }
      )
    }

    const orderTotalAmount = toAmount(order.total_amount)
    if (!Number.isFinite(orderTotalAmount) || orderTotalAmount <= 0) {
      return NextResponse.json({ error: 'Invalid order amount' }, { status: 400 })
    }

    const { data: existingRefunds, error: existingRefundsError } = await supabaseAdmin
      .from('order_refunds')
      .select('id, status, refund_amount')
      .eq('order_id', orderId)
      .in('status', ['pending', 'processing', 'approved', 'completed'])
      .order('created_at', { ascending: false })

    if (existingRefundsError) {
      return NextResponse.json(
        { error: `Failed to query existing refunds: ${existingRefundsError.message}` },
        { status: 500 }
      )
    }

    const refunds = (existingRefunds || []) as Array<{
      id: string
      status: RefundStatus
      refund_amount: number | string | null
    }>

    const completedRefundTotal = refunds
      .filter((item) => item.status === 'completed')
      .reduce((sum, item) => sum + (toAmount(item.refund_amount) || 0), 0)

    const inflightRefundTotal = refunds
      .filter(
        (item) =>
          item.status === 'pending' || item.status === 'processing' || item.status === 'approved'
      )
      .reduce((sum, item) => sum + (toAmount(item.refund_amount) || 0), 0)

    const duplicateRefund = refunds.find((item) => {
      const itemAmount = toAmount(item.refund_amount)
      return Number.isFinite(itemAmount) && Math.abs(itemAmount - refundAmount) < 0.0001
    })

    if (duplicateRefund) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        refund: {
          id: duplicateRefund.id,
          status: duplicateRefund.status,
          refund_amount: refundAmount,
        },
        message:
          duplicateRefund.status === 'completed'
            ? 'Refund already completed with this amount'
            : 'Refund already requested with this amount',
      })
    }

    const remainingRefundable = orderTotalAmount - completedRefundTotal - inflightRefundTotal
    if (refundAmount > remainingRefundable + 0.01) {
      return NextResponse.json(
        {
          error: `Refund amount exceeds remaining refundable amount (${remainingRefundable.toFixed(2)})`,
        },
        { status: 400 }
      )
    }

    const { data: refundRecord, error: refundRecordError } = await supabaseAdmin
      .from('order_refunds')
      .insert({
        order_id: orderId,
        refund_amount: refundAmount,
        currency: order.currency || 'USD',
        refund_reason: refundReason,
        refund_method: 'original_payment',
        status: 'pending',
      })
      .select('id')
      .single()

    if (refundRecordError || !refundRecord) {
      return NextResponse.json(
        { error: refundRecordError?.message || 'Failed to create refund record' },
        { status: 500 }
      )
    }

    const refundResult = await processRefundWithFallback({
      orderId,
      refundId: refundRecord.id,
      amount: refundAmount,
      currency: order.currency || 'USD',
      reason: refundReason,
      supabaseAdmin,
    })

    if (!refundResult.success) {
      logAudit({
        action: 'order_refund_request',
        userId: user.id,
        resourceId: refundRecord.id,
        resourceType: 'order_refund',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: {
          orderId,
          amount: refundAmount,
          reason: refundResult.error || 'unknown',
        },
      })
      return NextResponse.json(
        { error: refundResult.error || 'Failed to process refund', refundId: refundRecord.id },
        { status: 500 }
      )
    }

    logAudit({
      action: 'order_refund_request',
      userId: user.id,
      resourceId: refundRecord.id,
      resourceType: 'order_refund',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        orderId,
        amount: refundAmount,
        refundMethod: refundResult.refundMethod,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Refund processed successfully',
      refundId: refundRecord.id,
      refundMethod: refundResult.refundMethod,
      transactionId: refundResult.transactionId,
      journalId: refundResult.journalId,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (process.env.NODE_ENV === 'development') {
      console.error('[orders/refund] Error:', error)
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
