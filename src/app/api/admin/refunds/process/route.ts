/**
 * Admin refund processing API
 * Allows admins to manually process pending refunds
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { processRefund } from '@/lib/payments/process-refund'

export async function POST(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { refundId, orderId } = await request.json()

    if (!refundId || !orderId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Get refund details
    const { data: refund, error: refundError } = await supabaseAdmin
      .from('order_refunds')
      .select('*, order:orders!inner(id, payment_method, currency)')
      .eq('id', refundId)
      .single()

    if (refundError || !refund) {
      return NextResponse.json(
        { error: 'Refund not found' },
        { status: 404 }
      )
    }

    if (refund.status !== 'pending') {
      return NextResponse.json(
        { error: 'Refund is not in pending status' },
        { status: 400 }
      )
    }

    const order = (refund.order as any)

    // Process refund
    const refundResult = await processRefund({
      orderId,
      refundId,
      disputeId: refund.dispute_id || undefined,
      amount: refund.refund_amount,
      currency: refund.currency || order.currency || 'USD',
      refundMethod: (refund.refund_method as any) || 'platform_refund',
      supabaseAdmin,
    })

    if (!refundResult.success) {
      // Update refund status to failed
      await supabaseAdmin
        .from('order_refunds')
        .update({
          status: 'failed',
          failure_reason: refundResult.error || 'Refund processing failed',
        })
        .eq('id', refundId)

      return NextResponse.json(
        { error: refundResult.error || 'Failed to process refund' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Refund processed successfully',
    })
  } catch (error: any) {
    console.error('Process refund error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process refund' },
      { status: 500 }
    )
  }
}
