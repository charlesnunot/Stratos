/**
 * Payment accounts management API
 * Allows sellers to manage their payment accounts (Stripe, PayPal, Alipay, WeChat, Bank)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkSellerPermission } from '@/lib/auth/check-subscription'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check seller permission (including subscription status)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const sellerCheck = await checkSellerPermission(user.id, supabaseAdmin)
    if (!sellerCheck.hasPermission) {
      return NextResponse.json(
        { error: sellerCheck.reason || 'Seller subscription required' },
        { status: 403 }
      )
    }

    // Get all payment accounts for this user
    const { data: accounts, error: accountsError } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('seller_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (accountsError) {
      return NextResponse.json(
        { error: `Failed to fetch accounts: ${accountsError.message}` },
        { status: 500 }
      )
    }

    // Get seller payment account status from profiles table (new model)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('payment_provider, payment_account_id, provider_charges_enabled, provider_payouts_enabled, provider_account_status, seller_payout_eligibility')
      .eq('id', user.id)
      .single()

    // Combine payment_accounts data with profiles status
    const accountsWithStatus = (accounts || []).map((account) => ({
      ...account,
      // Add status from profiles if this is the bound account
      ...(profile && profile.payment_provider === account.account_type && profile.payment_account_id ? {
        provider_charges_enabled: profile.provider_charges_enabled,
        provider_payouts_enabled: profile.provider_payouts_enabled,
        provider_account_status: profile.provider_account_status,
        seller_payout_eligibility: profile.seller_payout_eligibility,
      } : {}),
    }))

    return NextResponse.json({ 
      accounts: accountsWithStatus,
      // Also return profile status for display
      profileStatus: profile ? {
        payment_provider: profile.payment_provider,
        payment_account_id: profile.payment_account_id,
        provider_charges_enabled: profile.provider_charges_enabled,
        provider_payouts_enabled: profile.provider_payouts_enabled,
        provider_account_status: profile.provider_account_status,
        seller_payout_eligibility: profile.seller_payout_eligibility,
      } : null,
    })
  } catch (error: any) {
    console.error('Get payment accounts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get payment accounts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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
    const {
      accountType,
      accountName,
      accountInfo,
      currency = 'USD',
      supportedCurrencies = ['USD'],
      isDefault = false,
    } = body

    // Validate required fields
    if (!accountType || !accountInfo) {
      return NextResponse.json(
        { error: 'Missing required fields: accountType and accountInfo' },
        { status: 400 }
      )
    }

    // Validate account type
    const validAccountTypes = ['stripe', 'paypal', 'alipay', 'wechat', 'bank']
    if (!validAccountTypes.includes(accountType)) {
      return NextResponse.json(
        { error: `Invalid account type. Must be one of: ${validAccountTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate currency
    const validCurrencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']
    if (!validCurrencies.includes(currency)) {
      return NextResponse.json(
        { error: `Invalid currency. Must be one of: ${validCurrencies.join(', ')}` },
        { status: 400 }
      )
    }

    // If setting as default, unset other default accounts of the same type
    if (isDefault) {
      await supabase
        .from('payment_accounts')
        .update({ is_default: false })
        .eq('seller_id', user.id)
        .eq('account_type', accountType)
    }

    // Create payment account
    const { data: newAccount, error: createError } = await supabase
      .from('payment_accounts')
      .insert({
        seller_id: user.id,
        account_type: accountType,
        account_name: accountName || `${accountType} account`,
        account_info: accountInfo,
        currency: currency,
        supported_currencies: supportedCurrencies,
        is_default: isDefault,
        is_verified: false, // New accounts need verification
        verification_status: 'pending',
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json(
        { error: `Failed to create account: ${createError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ account: newAccount }, { status: 201 })
  } catch (error: any) {
    console.error('Create payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment account' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check seller permission (including subscription status)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const sellerCheck = await checkSellerPermission(user.id, supabaseAdmin)
    if (!sellerCheck.hasPermission) {
      return NextResponse.json(
        { error: sellerCheck.reason || 'Seller subscription required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, accountName, accountInfo, currency, supportedCurrencies, isDefault } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    // Verify account belongs to user
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id')
      .eq('id', id)
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
      const { data: accountType } = await supabase
        .from('payment_accounts')
        .select('account_type')
        .eq('id', id)
        .single()

      if (accountType) {
        await supabase
          .from('payment_accounts')
          .update({ is_default: false })
          .eq('seller_id', user.id)
          .eq('account_type', accountType.account_type)
          .neq('id', id)
      }
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
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update account: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ account: updatedAccount })
  } catch (error: any) {
    console.error('Update payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update payment account' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check seller permission (including subscription status)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const sellerCheck = await checkSellerPermission(user.id, supabaseAdmin)
    if (!sellerCheck.hasPermission) {
      return NextResponse.json(
        { error: sellerCheck.reason || 'Seller subscription required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    // Verify account belongs to user
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id')
      .eq('id', id)
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

    // Delete account
    const { error: deleteError } = await supabase
      .from('payment_accounts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete account: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete payment account' },
      { status: 500 }
    )
  }
}
