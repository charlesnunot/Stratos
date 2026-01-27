/**
 * Retry failed transfers API
 * Allows admins to manually retry failed transfers
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { retryTransfer, retryFailedTransfers } from '@/lib/payments/retry-transfer'

export async function POST(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const body = await request.json()
    const { transferId, batch } = body

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    if (batch) {
      // Batch retry failed transfers
      const limit = body.limit || 10
      const result = await retryFailedTransfers(supabaseAdmin, limit)

      return NextResponse.json({
        success: true,
        ...result,
      })
    } else if (transferId) {
      // Retry specific transfer
      const result = await retryTransfer({
        transferId,
        supabaseAdmin,
      })

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to retry transfer' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Missing transferId or batch flag' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Retry transfer error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to retry transfer' },
      { status: 500 }
    )
  }
}
