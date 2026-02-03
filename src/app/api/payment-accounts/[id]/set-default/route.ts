/**
 * Set default payment account API
 * Sets a payment account as the default for its type and syncs to profile so seller can receive payments.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { updateSellerPayoutEligibility } from '@/lib/payments/update-seller-payout-eligibility'

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

    // Verify account belongs to user and get account type + verification
    const { data: account, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id, account_type, is_verified')
      .eq('id', params.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    if (account.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your account' },
        { status: 403 }
      )
    }

    // Unset other default accounts of the same type
    await supabase
      .from('payment_accounts')
      .update({ is_default: false })
      .eq('seller_id', user.id)
      .eq('account_type', account.account_type)
      .neq('id', params.id)

    // Set this account as default
    const { data: updatedAccount, error: updateError } = await supabase
      .from('payment_accounts')
      .update({ is_default: true })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'payment_account_set_default',
        userId: user.id,
        resourceId: params.id,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: `Failed to set default account: ${updateError.message}` },
        { status: 500 }
      )
    }

    // Sync to profile so validateSellerPaymentReady and payout eligibility use this account (non-Stripe only; Stripe is set in Connect callback)
    const accountType = updatedAccount.account_type as string
    if (accountType !== 'stripe' && updatedAccount.is_verified) {
      const supabaseAdmin = await getSupabaseAdmin()
      const profileUpdate: Record<string, unknown> = {
        payment_provider: accountType,
        payment_account_id: params.id,
      }
      if (accountType === 'bank') {
        profileUpdate.provider_account_status = 'enabled'
      }
      await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id)
      await updateSellerPayoutEligibility({ sellerId: user.id, supabaseAdmin })
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'payment_account_set_default',
      userId: user.id,
      resourceId: params.id,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ account: updatedAccount })
  } catch (error: any) {
    console.error('Set default payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to set default payment account' },
      { status: 500 }
    )
  }
}
