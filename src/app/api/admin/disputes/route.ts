/**
 * Admin disputes management API
 * Allows admins to view and resolve disputes
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { processRefund } from '@/lib/payments/process-refund'
import { processRefundWithFallback } from '@/lib/payments/process-refund-with-fallback'
import { logPayment, LogLevel } from '@/lib/payments/logger'
import { logAudit } from '@/lib/api/audit'

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
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Get disputes error:', error)
    }

    const message = error instanceof Error ? error.message : 'Failed to get disputes'
    return NextResponse.json(
      { error: message },
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
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const { disputeId, resolution, refundAmount, refundMethod } = body

    if (!disputeId || typeof disputeId !== 'string' || !resolution || typeof resolution !== 'string') {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const parsedRefundAmount =
      refundAmount === null || refundAmount === undefined || refundAmount === ''
        ? 0
        : Number(refundAmount)
    if (!Number.isFinite(parsedRefundAmount) || parsedRefundAmount < 0) {
      return NextResponse.json(
        { error: 'Invalid refund amount' },
        { status: 400 }
      )
    }

    const validRefundMethods = ['original_payment', 'bank_transfer', 'platform_refund'] as const
    const hasRefund = parsedRefundAmount > 0
    if (hasRefund && refundMethod && !validRefundMethods.includes(refundMethod)) {
      return NextResponse.json(
        { error: 'Invalid refund method' },
        { status: 400 }
      )
    }
    const effectiveRefundMethod = (refundMethod || 'platform_refund') as typeof validRefundMethods[number]

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Get dispute and order details
    const { data: dispute, error: disputeError } = await supabaseAdmin
      .from('order_disputes')
      .select('*, orders!inner(id, total_amount, currency, seller_id, buyer_id, order_number)')
      .eq('id', disputeId)
      .single()

    if (disputeError || !dispute) {
      return NextResponse.json(
        { error: 'Dispute not found' },
        { status: 404 }
      )
    }

    const order = (dispute.orders as any)

    // Terminal status idempotency
    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      logPayment(LogLevel.INFO, '[disputes] Dispute already resolved', {
        disputeId,
        orderId: order.id,
        disputeStatus: dispute.status,
        adminId: user.id,
      })
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: `Dispute already ${dispute.status}`,
      })
    }

    if (!['pending', 'reviewing'].includes(dispute.status)) {
      return NextResponse.json(
        { error: `Dispute status ${dispute.status} cannot be processed` },
        { status: 400 }
      )
    }

    if (hasRefund) {
      if (parsedRefundAmount > Number(order.total_amount)) {
        return NextResponse.json(
          { error: `Refund amount (${parsedRefundAmount}) cannot exceed order total (${order.total_amount})` },
          { status: 400 }
        )
      }
    }

    let refundProcessed = false
    let refundSkipped = false
    let refundId: string | undefined

    // If this action includes refund, process refund first and resolve only on success.
    if (hasRefund) {
      const { data: existingCompletedRefund } = await supabaseAdmin
        .from('order_refunds')
        .select('id, status, refund_amount')
        .eq('order_id', order.id)
        .eq('status', 'completed')
        .maybeSingle()

      if (existingCompletedRefund) {
        logPayment(LogLevel.WARN, '[disputes] Order already has completed refund', {
          disputeId,
          orderId: order.id,
          existingRefundId: existingCompletedRefund.id,
          requestedAmount: parsedRefundAmount,
        })
        refundSkipped = true
      } else {
        const { data: existingRefund } = await supabaseAdmin
          .from('order_refunds')
          .select('id, status')
          .eq('order_id', order.id)
          .in('status', ['pending', 'processing'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        refundId = existingRefund?.id

        if (!refundId) {
          const { data: newRefund, error: refundError } = await supabaseAdmin
            .from('order_refunds')
            .insert({
              order_id: order.id,
              dispute_id: disputeId,
              refund_amount: parsedRefundAmount,
              currency: order.currency || 'USD',
              refund_reason: resolution.trim(),
              refund_method: effectiveRefundMethod,
              status: 'pending',
            })
            .select()
            .single()

          if (refundError || !newRefund) {
            if (process.env.NODE_ENV === 'development') {
              console.error('Error creating refund:', refundError)
            }
            logPayment(LogLevel.ERROR, '[disputes] Failed to create refund record', {
              disputeId,
              orderId: order.id,
              error: refundError?.message || 'Unknown error',
            })
            return NextResponse.json(
              { error: refundError?.message || 'Failed to create refund record' },
              { status: 500 }
            )
          }
          refundId = newRefund.id
        } else {
          logPayment(LogLevel.INFO, '[disputes] Using existing pending refund', {
            disputeId,
            existingRefundId: refundId,
          })
        }

        if (!refundId) {
          return NextResponse.json(
            { error: 'Failed to resolve refund id for dispute processing' },
            { status: 500 }
          )
        }

        const refundResult =
          effectiveRefundMethod === 'original_payment'
            ? await processRefundWithFallback({
                orderId: order.id,
                refundId,
                disputeId,
                amount: parsedRefundAmount,
                currency: order.currency || 'USD',
                reason: resolution.trim(),
                supabaseAdmin,
              })
            : await processRefund({
                orderId: order.id,
                refundId,
                disputeId,
                amount: parsedRefundAmount,
                currency: order.currency || 'USD',
                refundMethod: effectiveRefundMethod,
                supabaseAdmin,
                operatorId: user.id,
              })

        if (!refundResult.success) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Refund processing failed:', refundResult.error)
          }
          logPayment(LogLevel.ERROR, '[disputes] Refund processing failed', {
            disputeId,
            refundId,
            error: refundResult.error,
            errorCode: refundResult.errorCode,
          })
          return NextResponse.json(
            { error: refundResult.error || 'Refund processing failed' },
            { status: 502 }
          )
        }

        refundProcessed = true
        logPayment(LogLevel.INFO, '[disputes] Refund processed successfully', {
          disputeId,
          refundId,
          transactionId: refundResult.transactionId,
        })
      }
    }

    const finalStatus = hasRefund ? 'resolved' : 'rejected'
    const { error: updateDisputeError } = await supabaseAdmin
      .from('order_disputes')
      .update({
        status: finalStatus,
        resolution: resolution.trim(),
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', disputeId)

    if (updateDisputeError) {
      return NextResponse.json(
        { error: updateDisputeError.message || 'Failed to update dispute status' },
        { status: 500 }
      )
    }

    // Audit log
    logAudit({
      action: finalStatus === 'resolved' ? 'dispute_resolve' : 'dispute_reject',
      userId: user.id,
      resourceId: disputeId,
      resourceType: 'order_dispute',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        orderId: order.id,
        status: finalStatus,
        resolution: resolution.trim(),
        refundAmount: parsedRefundAmount,
        refundMethod: hasRefund ? effectiveRefundMethod : null,
        refundId: refundId || null,
        refundProcessed,
        refundSkipped,
      },
    })

    const buyerTitle = finalStatus === 'resolved' ? 'Dispute Resolved' : 'Dispute Rejected'
    const sellerTitle = finalStatus === 'resolved' ? 'Dispute Resolved' : 'Dispute Rejected'
    const buyerContentKey = finalStatus === 'resolved' ? 'dispute_resolved' : 'dispute_rejected'
    const sellerContentKey = finalStatus === 'resolved' ? 'dispute_resolved_seller' : 'dispute_rejected_seller'

    // Notify buyer and seller
    await supabaseAdmin.from('notifications').insert([
      {
        user_id: order.buyer_id,
        type: 'system',
        title: buyerTitle,
        content: `Your dispute for order ${order.order_number} has been ${finalStatus}: ${resolution.trim()}`,
        related_id: order.id,
        related_type: 'order',
        link: `/orders/${order.id}/dispute`,
        content_key: buyerContentKey,
        content_params: { orderNumber: order.order_number, resolution: resolution.trim(), status: finalStatus },
      },
      {
        user_id: order.seller_id,
        type: 'system',
        title: sellerTitle,
        content: `Dispute for order ${order.order_number} has been ${finalStatus}: ${resolution.trim()}`,
        related_id: order.id,
        related_type: 'order',
        link: `/seller/orders/${order.id}/dispute`,
        content_key: sellerContentKey,
        content_params: { orderNumber: order.order_number, resolution: resolution.trim(), status: finalStatus },
      },
    ])

    return NextResponse.json({
      success: true,
      status: finalStatus,
      refundProcessed,
      refundSkipped,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Resolve dispute error:', error)
    }

    const message = error instanceof Error ? error.message : 'Failed to resolve dispute'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
