import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { refund_amount, reason } = body
    
    if (!refund_amount || refund_amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid refund amount' },
        { status: 400 }
      )
    }
    
    const admin = await getSupabaseAdmin()
    
    // 验证订单存在且属于当前用户（卖家）
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, seller_id, order_status')
      .eq('id', orderId)
      .single()
    
    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    
    // 只有卖家可以处理退款
    if (order.seller_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // 调用退款函数（自动验证金额上限）
    const { data: result, error: refundError } = await admin.rpc('issue_commission_refund', {
      p_order_id: orderId,
      p_refund_amount: refund_amount,
      p_reason: reason || 'Seller initiated refund'
    })
    
    if (refundError) {
      console.error('[orders/refund] RPC error:', refundError)
      return NextResponse.json(
        { error: 'Refund failed', details: refundError.message },
        { status: 500 }
      )
    }
    
    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: 'Refund failed', details: 'Unknown error' },
        { status: 500 }
      )
    }
    
    const refundResult = result[0]
    
    if (!refundResult.success) {
      return NextResponse.json(
        { error: refundResult.message },
        { status: 400 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: refundResult.message,
      ledger_id: refundResult.ledger_id
    })
  } catch (error) {
    console.error('[orders/refund] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
