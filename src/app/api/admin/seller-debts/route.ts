/**
 * Seller debts management API
 * Allows admins to view and manage seller debts
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { collectDebtFromDeposit } from '@/lib/debts/collect-debt'
import { deductFromDeposit } from '@/lib/deposits/deduct-from-deposit'

export async function GET(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const sellerId = searchParams.get('sellerId')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabaseAdmin
      .from('seller_debts')
      .select(`
        *,
        seller:profiles!seller_debts_seller_id_fkey(id, username, display_name),
        order:orders(id, order_number, total_amount, currency),
        dispute:order_disputes(id, dispute_type, status),
        refund:order_refunds(id, refund_amount, currency)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (sellerId) {
      query = query.eq('seller_id', sellerId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: debts, error: debtsError } = await query

    if (debtsError) {
      return NextResponse.json(
        { error: `Failed to fetch debts: ${debtsError.message}` },
        { status: 500 }
      )
    }

    // Get summary statistics
    const { data: stats } = await supabaseAdmin
      .from('seller_debts')
      .select('status, debt_amount, currency')

    const summary = {
      total: stats?.length || 0,
      pending: stats?.filter((d: any) => d.status === 'pending').length || 0,
      collected: stats?.filter((d: any) => d.status === 'collected').length || 0,
      totalPendingAmount: stats
        ?.filter((d: any) => d.status === 'pending')
        .reduce((sum: number, d: any) => sum + parseFloat(d.debt_amount || 0), 0) || 0,
    }

    return NextResponse.json({
      debts: debts || [],
      summary,
    })
  } catch (error: any) {
    console.error('Get seller debts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get seller debts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    const adminId = authResult.data.user.id

    const supabaseAdmin = await getSupabaseAdmin()

    const body = await request.json().catch(() => ({}))
    const { action, sellerId, amount, reason, debtId } = body as {
      action?: string
      sellerId?: string
      amount?: number | string
      reason?: string
      debtId?: string
    }

    switch (action) {
      case 'collect_from_deposit':
        if (!sellerId) {
          return NextResponse.json(
            { error: 'sellerId is required' },
            { status: 400 }
          )
        }

        const collectResult = await collectDebtFromDeposit(sellerId, supabaseAdmin)
        if (!collectResult.success) {
          logAudit({
            action: 'seller_debt_adjust',
            userId: adminId,
            resourceId: sellerId,
            resourceType: 'seller_debt',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { action: 'collect_from_deposit', reason: collectResult.error },
          })
          return NextResponse.json(
            { error: collectResult.error || 'Failed to collect debt from deposit' },
            { status: 500 }
          )
        }
        logAudit({
          action: 'seller_debt_adjust',
          userId: adminId,
          resourceId: sellerId,
          resourceType: 'seller_debt',
          result: 'success',
          timestamp: new Date().toISOString(),
          meta: { action: 'collect_from_deposit', collectedCount: collectResult.collectedCount },
        })
        return NextResponse.json({
          success: true,
          collectedCount: collectResult.collectedCount,
          totalCollected: collectResult.totalCollected,
        })

      case 'deduct_from_deposit':
        if (!sellerId || !amount || !reason || !debtId) {
          return NextResponse.json(
            { error: 'sellerId, amount, reason, and debtId are required' },
            { status: 400 }
          )
        }

        // Get debt details
        const { data: debt, error: debtError } = await supabaseAdmin
          .from('seller_debts')
          .select('*')
          .eq('id', debtId)
          .single()

        if (debtError || !debt) {
          return NextResponse.json(
            { error: 'Debt not found' },
            { status: 404 }
          )
        }

        const deductResult = await deductFromDeposit({
          sellerId,
          amount: parseFloat(String(amount)),
          currency: debt.currency as any,
          reason,
          relatedId: debtId,
          relatedType: 'debt',
          supabaseAdmin,
        })

        if (!deductResult.success) {
          logAudit({
            action: 'seller_debt_adjust',
            userId: adminId,
            resourceId: sellerId,
            resourceType: 'seller_debt',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { action: 'deduct_from_deposit', debtId, reason: deductResult.error },
          })
          return NextResponse.json(
            { error: deductResult.error || 'Failed to deduct from deposit' },
            { status: 500 }
          )
        }

        // Update debt status
        await supabaseAdmin
          .from('seller_debts')
          .update({
            status: 'collected',
            collection_method: 'deposit_deduction',
            collected_at: new Date().toISOString(),
          })
          .eq('id', debtId)

        logAudit({
          action: 'seller_debt_adjust',
          userId: adminId,
          resourceId: sellerId,
          resourceType: 'seller_debt',
          result: 'success',
          timestamp: new Date().toISOString(),
          meta: { action: 'deduct_from_deposit', debtId },
        })
        return NextResponse.json({
          success: true,
          deductedAmount: deductResult.deductedAmount,
          remainingBalance: deductResult.remainingBalance,
        })

      case 'mark_paid':
        if (!debtId) {
          return NextResponse.json(
            { error: 'debtId is required' },
            { status: 400 }
          )
        }

        await supabaseAdmin
          .from('seller_debts')
          .update({
            status: 'paid',
            collection_method: 'manual',
            collected_at: new Date().toISOString(),
          })
          .eq('id', debtId)

        logAudit({
          action: 'seller_debt_adjust',
          userId: adminId,
          resourceId: debtId,
          resourceType: 'seller_debt',
          result: 'success',
          timestamp: new Date().toISOString(),
          meta: { action: 'mark_paid' },
        })
        return NextResponse.json({ success: true })

      case 'forgive':
        if (!debtId) {
          return NextResponse.json(
            { error: 'debtId is required' },
            { status: 400 }
          )
        }

        await supabaseAdmin
          .from('seller_debts')
          .update({
            status: 'forgiven',
            collection_method: 'manual',
            collected_at: new Date().toISOString(),
          })
          .eq('id', debtId)

        logAudit({
          action: 'seller_debt_adjust',
          userId: adminId,
          resourceId: debtId,
          resourceType: 'seller_debt',
          result: 'success',
          timestamp: new Date().toISOString(),
          meta: { action: 'forgive' },
        })
        return NextResponse.json({ success: true })

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Process seller debt error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process seller debt' },
      { status: 500 }
    )
  }
}
