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
  { params }: { params: { lotId: string } }
) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Process refund
    const result = await processDepositRefund({
      lotId: params.lotId,
      supabaseAdmin,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process refund' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Refund processed successfully',
      transactionId: result.transactionId,
    })
  } catch (error: any) {
    console.error('[admin/process-refund] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process refund' },
      { status: 500 }
    )
  }
}
