/**
 * Admin API: Process deposit refund
 * Allows administrators to manually trigger deposit refund processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { processDepositRefund } from '@/lib/deposits/process-deposit-refund'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  try {
    const { lotId } = await params
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    const adminId = authResult.data.user.id

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Process refund
    const result = await processDepositRefund({
      lotId,
      supabaseAdmin,
    })

    if (!result.success) {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'admin_deposit_refund_process',
        userId: adminId,
        resourceId: lotId,
        resourceType: 'deposit_lot',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: result.error },
      })
      return NextResponse.json(
        { error: result.error || 'Failed to process refund' },
        { status: 500 }
      )
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'admin_deposit_refund_process',
      userId: adminId,
      resourceId: lotId,
      resourceType: 'deposit_lot',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { transactionId: result.transactionId },
    })
    return NextResponse.json({
      success: true,
      message: 'Refund processed successfully',
      transactionId: result.transactionId,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[admin/process-refund] Error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to process refund'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
