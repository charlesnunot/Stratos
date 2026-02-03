/**
 * Admin payment account verification API
 * Allows admins to verify or reject payment accounts
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { updateSellerPayoutEligibility } from '@/lib/payments/update-seller-payout-eligibility'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: accountId } = await params
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
        p_account_id: accountId,
        p_verified_by: user.id,
        p_status: status,
        p_notes: notes || null,
      })

    if (verifyError) {
      logAudit({
        action: 'payment_account_verify',
        userId: user.id,
        resourceId: accountId,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: verifyError.message },
      })
      return NextResponse.json(
        { error: `Failed to verify account: ${verifyError.message}` },
        { status: 500 }
      )
    }

    // Get updated account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('payment_accounts')
      .select('*, profiles!payment_accounts_seller_id_fkey(id, username, display_name)')
      .eq('id', accountId)
      .single()

    if (accountError || !account) {
      logAudit({
        action: 'payment_account_verify',
        userId: user.id,
        resourceId: accountId,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: accountError?.message ?? 'Account not found' },
      })
      return NextResponse.json(
        { error: `Failed to fetch account: ${accountError?.message ?? 'Not found'}` },
        { status: 500 }
      )
    }

    // When verified: if this account is the seller's default, sync to profile and recalc eligibility so seller can receive payments (non-Stripe; Stripe is updated by Connect callback/webhook)
    if (status === 'verified' && account.seller_id && account.account_type !== 'stripe' && account.is_default) {
      const profileUpdate: Record<string, unknown> = {
        payment_provider: account.account_type,
        payment_account_id: accountId,
        provider_account_status: 'enabled',
      }
      await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', account.seller_id)
      await updateSellerPayoutEligibility({
        sellerId: account.seller_id,
        supabaseAdmin,
      })
    } else if (status === 'verified' && account.seller_id && account.account_type !== 'stripe') {
      // Verified but not default: only recalc eligibility (profile may already point to default; if no default yet, eligibility stays pending until they set default)
      await updateSellerPayoutEligibility({
        sellerId: account.seller_id,
        supabaseAdmin,
      })
    }

    // Create notification for seller (use content_key for i18n)
    if (account.seller_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: account.seller_id,
        type: 'system',
        title: status === 'verified' ? 'Payment Account Verified' : 'Payment Account Rejected',
        content: status === 'verified'
          ? 'Your payment account has been verified. You can now receive payments.'
          : `Your payment account verification was rejected.${notes ? ` Reason: ${notes}` : ''}`,
        related_id: accountId,
        related_type: 'payment_account',
        link: '/seller/payment-accounts',
        content_key: status === 'verified' ? 'payment_account_verified' : 'payment_account_rejected',
        content_params: { notes: notes || '' },
      })
    }

    logAudit({
      action: 'payment_account_verify',
      userId: user.id,
      resourceId: accountId,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { status },
    })

    return NextResponse.json({
      success: true,
      account,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Verify payment account error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to verify payment account'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
