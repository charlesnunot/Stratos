/**
 * Specific seller debt statistics API
 * Returns debt statistics and history for a specific seller
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getSellerDepositBalance } from '@/lib/deposits/deduct-from-deposit'

export async function GET(
  request: NextRequest,
  { params }: { params: { sellerId: string } }
) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const sellerId = params.sellerId

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Get seller profile
    const { data: seller, error: sellerError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, role')
      .eq('id', sellerId)
      .single()

    if (sellerError || !seller) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      )
    }

    // Get all debts for this seller
    const { data: debts, error: debtsError } = await supabaseAdmin
      .from('seller_debts')
      .select(`
        *,
        order:orders(id, order_number, total_amount, currency),
        dispute:order_disputes(id, dispute_type, status),
        refund:order_refunds(id, refund_amount, currency)
      `)
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })

    if (debtsError) {
      return NextResponse.json(
        { error: `Failed to fetch debts: ${debtsError.message}` },
        { status: 500 }
      )
    }

    // Calculate statistics
    const totalDebt = debts
      ?.filter((d) => d.status === 'pending')
      .reduce((sum, d) => sum + parseFloat(d.debt_amount || 0), 0) || 0

    const totalCollected = debts
      ?.filter((d) => d.status === 'collected')
      .reduce((sum, d) => sum + parseFloat(d.debt_amount || 0), 0) || 0

    const totalPaid = debts
      ?.filter((d) => d.status === 'paid')
      .reduce((sum, d) => sum + parseFloat(d.debt_amount || 0), 0) || 0

    // Get deposit balance
    const depositBalance = await getSellerDepositBalance(sellerId, supabaseAdmin)

    // Get deposit lots
    const { data: depositLots } = await supabaseAdmin
      .from('seller_deposit_lots')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('status', 'held')
      .order('held_at', { ascending: true })

    return NextResponse.json({
      seller,
      statistics: {
        totalDebt,
        totalCollected,
        totalPaid,
        pendingDebtCount: debts?.filter((d) => d.status === 'pending').length || 0,
        collectedDebtCount: debts?.filter((d) => d.status === 'collected').length || 0,
        depositBalance,
        depositLotsCount: depositLots?.length || 0,
      },
      debts: debts || [],
      depositLots: depositLots || [],
    })
  } catch (error: any) {
    console.error('Get seller debt statistics error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get seller debt statistics' },
      { status: 500 }
    )
  }
}
