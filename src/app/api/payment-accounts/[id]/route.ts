/**
 * Single payment account API
 * GET, PUT, DELETE operations for a specific payment account
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(
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

    const { data: account, error: accountError } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('id', params.id)
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    // Verify account belongs to user
    if (account.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your account' },
        { status: 403 }
      )
    }

    return NextResponse.json({ account })
  } catch (error: any) {
    console.error('Get payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get payment account' },
      { status: 500 }
    )
  }
}

export async function PUT(
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

    const body = await request.json()
    const { accountName, accountInfo, currency, supportedCurrencies, isDefault } = body

    // Verify account belongs to user
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id, account_type')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingAccount) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    if (existingAccount.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your account' },
        { status: 403 }
      )
    }

    // If setting as default, unset other default accounts of the same type
    if (isDefault) {
      await supabase
        .from('payment_accounts')
        .update({ is_default: false })
        .eq('seller_id', user.id)
        .eq('account_type', existingAccount.account_type)
        .neq('id', params.id)
    }

    // Build update object
    const updateData: any = {}
    if (accountName !== undefined) updateData.account_name = accountName
    if (accountInfo !== undefined) updateData.account_info = accountInfo
    if (currency !== undefined) updateData.currency = currency
    if (supportedCurrencies !== undefined) updateData.supported_currencies = supportedCurrencies
    if (isDefault !== undefined) updateData.is_default = isDefault

    // Update account
    const { data: updatedAccount, error: updateError } = await supabase
      .from('payment_accounts')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'payment_account_update',
        userId: user.id,
        resourceId: params.id,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: `Failed to update account: ${updateError.message}` },
        { status: 500 }
      )
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'payment_account_update',
      userId: user.id,
      resourceId: params.id,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ account: updatedAccount })
  } catch (error: any) {
    console.error('Update payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update payment account' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Verify account belongs to user and check verification status
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id, verification_status, account_type')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingAccount) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    if (existingAccount.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your account' },
        { status: 403 }
      )
    }

    // Prevent deleting verified accounts
    if (existingAccount.verification_status === 'verified') {
      return NextResponse.json(
        { error: 'Cannot delete verified account. Please contact support if you need to remove this account.' },
        { status: 403 }
      )
    }

    // Delete account
    const { error: deleteError } = await supabase
      .from('payment_accounts')
      .delete()
      .eq('id', params.id)

    // If delete successful and this was the default/bound account, clear profiles reference
    if (!deleteError) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('payment_account_id')
        .eq('id', user.id)
        .single()
      
      if (profile?.payment_account_id === params.id) {
        const supabaseAdmin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
        await supabaseAdmin
          .from('profiles')
          .update({
            payment_provider: null,
            payment_account_id: null,
            provider_charges_enabled: null,
            provider_payouts_enabled: null,
            provider_account_status: null,
            seller_payout_eligibility: null,
          })
          .eq('id', user.id)
      }
    }

    if (deleteError) {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'payment_account_delete',
        userId: user.id,
        resourceId: params.id,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: deleteError.message },
      })
      return NextResponse.json(
        { error: `Failed to delete account: ${deleteError.message}` },
        { status: 500 }
      )
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'payment_account_delete',
      userId: user.id,
      resourceId: params.id,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete payment account' },
      { status: 500 }
    )
  }
}
