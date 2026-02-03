/**
 * Request deposit refund API
 * Allows seller to request refund for a refundable deposit lot
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/api/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  try {
    const { lotId } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Get lot details
    const { data: lot, error: lotError } = await supabaseAdmin
      .from('seller_deposit_lots')
      .select('*')
      .eq('id', lotId)
      .single()

    if (lotError || !lot) {
      return NextResponse.json(
        { error: 'Deposit lot not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (lot.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Verify status
    if (lot.status !== 'refundable') {
      return NextResponse.json(
        { error: `Deposit lot is not refundable. Current status: ${lot.status}` },
        { status: 400 }
      )
    }

    // Verify refundable_at
    if (lot.refundable_at && new Date(lot.refundable_at) > new Date()) {
      return NextResponse.json(
        { error: 'Deposit is not yet refundable. Please wait until the refundable date.' },
        { status: 400 }
      )
    }

    // Update lot status to 'refunding'
    const { error: updateError } = await supabaseAdmin
      .from('seller_deposit_lots')
      .update({
        status: 'refunding',
        updated_at: new Date().toISOString(),
      })
      .eq('id', lotId)

    if (updateError) {
      console.error('[request-refund] Error updating lot:', updateError)
      return NextResponse.json(
        { error: 'Failed to request refund' },
        { status: 500 }
      )
    }

    // Log audit
    logAudit({
      action: 'deposit_refund_request',
      userId: user.id,
      resourceId: lot.id,
      resourceType: 'deposit_lot',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    // Send notification (non-blocking; log errors only)
    try {
      const { error: notifError } = await supabaseAdmin.from('notifications').insert({
        user_id: user.id,
        type: 'deposit',
        title: 'Deposit Refund Request Submitted',
        content: `Your deposit refund request has been submitted. Amount: ${lot.required_amount} ${lot.currency}. Processing time: 3-5 business days.`,
        related_id: lot.id,
        related_type: 'deposit_lot',
        link: `/seller/deposit`,
        content_key: 'deposit_refund_request',
        content_params: {
          amount: lot.required_amount.toString(),
          currency: lot.currency,
        },
      })
      if (notifError) {
        console.error('[request-refund] Failed to send notification:', notifError)
      }
    } catch (err) {
      console.error('[request-refund] Failed to send notification:', err)
    }

    return NextResponse.json({
      success: true,
      message: 'Refund request submitted',
      lot_id: lot.id,
      amount: lot.required_amount,
      currency: lot.currency,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[request-refund] Error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to request refund'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
