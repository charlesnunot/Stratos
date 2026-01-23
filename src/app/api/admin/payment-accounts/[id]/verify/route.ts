/**
 * Admin payment account verification API
 * Allows admins to verify or reject payment accounts
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { status, notes } = body

    if (!status || !['verified', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "verified" or "rejected"' },
        { status: 400 }
      )
    }

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
