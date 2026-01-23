import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Settle a commission (mark as paid)
 * Only accessible by admins
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const commissionId = params.id

    if (!commissionId) {
      return NextResponse.json(
        { error: 'Commission ID required' },
        { status: 400 }
      )
    }

    // Use service role client for admin operations
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
