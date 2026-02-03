import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Settle a commission (mark as paid)
 * Only accessible by admins
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: commissionId } = await params
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    const adminId = authResult.data.user.id

    if (!commissionId) {
      return NextResponse.json(
        { error: 'Commission ID required' },
        { status: 400 }
      )
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Get commission details
    const { data: commission, error: commissionError } = await supabaseAdmin
      .from('affiliate_commissions')
      .select('*')
      .eq('id', commissionId)
      .single()

    if (commissionError || !commission) {
      return NextResponse.json(
        { error: 'Commission not found' },
        { status: 404 }
      )
    }

    if (commission.status !== 'pending') {
      return NextResponse.json(
        { error: 'Commission is not pending' },
        { status: 400 }
      )
    }

    // Update commission status to paid
    const { error: updateError } = await supabaseAdmin
      .from('affiliate_commissions')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', commissionId)

    if (updateError) {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'admin_commission_settle',
        userId: adminId,
        resourceId: commissionId,
        resourceType: 'affiliate_commission',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'admin_commission_settle',
      userId: adminId,
      resourceId: commissionId,
      resourceType: 'affiliate_commission',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    // Create notification for affiliate (use content_key for i18n)
    await supabaseAdmin.from('notifications').insert({
      user_id: commission.affiliate_id,
      type: 'commission',
      title: 'Commission Settled',
      content: `Your commission of ¥${commission.amount.toFixed(2)} has been settled`,
      related_id: commission.id,
      related_type: 'order',
      link: `/affiliate/commissions?order=${commission.order_id}`,
      content_key: 'commission_settled',
      content_params: {
        amount: commission.amount.toFixed(2),
        orderId: commission.order_id?.substring(0, 8) + '...',
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Settle commission error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to settle commission'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
