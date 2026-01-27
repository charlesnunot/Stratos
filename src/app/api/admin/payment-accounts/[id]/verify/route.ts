/**
 * Admin payment account verification API
 * Allows admins to verify or reject payment accounts
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

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

    const { user } = authResult.data
    const body = await request.json()
    const { status, notes } = body

    if (!status || !['verified', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "verified" or "rejected"' },
        { status: 400 }
      )
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Verify payment account using database function
    const { data: result, error: verifyError } = await supabaseAdmin
      .rpc('verify_payment_account', {
        p_account_id: params.id,
        p_verified_by: user.id,
        p_status: status,
        p_notes: notes || null,
      })

    if (verifyError) {
      return NextResponse.json(
        { error: `Failed to verify account: ${verifyError.message}` },
        { status: 500 }
      )
    }

    // Get updated account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('payment_accounts')
      .select('*, profiles!payment_accounts_seller_id_fkey(id, username, display_name)')
      .eq('id', params.id)
      .single()

    if (accountError) {
      return NextResponse.json(
        { error: `Failed to fetch account: ${accountError.message}` },
        { status: 500 }
      )
    }

    // Create notification for seller
    if (account.seller_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: account.seller_id,
        type: 'system',
        title: status === 'verified' ? '支付账户已验证' : '支付账户验证被拒绝',
        content: status === 'verified'
          ? '您的支付账户已通过验证，现在可以正常收款了。'
          : `您的支付账户验证被拒绝。${notes ? `原因：${notes}` : ''}`,
        related_id: params.id,
        related_type: 'payment_account',
        link: '/seller/payment-accounts',
      })
    }

    return NextResponse.json({
      success: true,
      account,
    })
  } catch (error: any) {
    console.error('Verify payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to verify payment account' },
      { status: 500 }
    )
  }
}
