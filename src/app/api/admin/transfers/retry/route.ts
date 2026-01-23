/**
 * Retry failed transfers API
 * Allows admins to manually retry failed transfers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { retryTransfer, retryFailedTransfers } from '@/lib/payments/retry-transfer'

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

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { transferId, batch } = body

    // Use admin client
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
