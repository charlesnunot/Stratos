import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Settle a commission (mark as paid)
 * Only accessible by admins
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const commissionId = params.id

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
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Create notification for affiliate
    await supabaseAdmin.from('notifications').insert({
      user_id: commission.affiliate_id,
      type: 'commission',
      title: '佣金已结算',
      content: `您的佣金 ¥${commission.amount.toFixed(2)} 已结算`,
      related_id: commission.id,
      related_type: 'order',
      link: `/affiliate/commissions?order=${commission.order_id}`,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Settle commission error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to settle commission' },
      { status: 500 }
    )
  }
}
