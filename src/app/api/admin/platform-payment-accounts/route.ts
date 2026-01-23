/**
 * Platform payment accounts management API
 * Allows admins to manage platform payment accounts (Stripe, PayPal, Alipay, WeChat)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get all platform payment accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('is_platform_account', true)
      .order('created_at', { ascending: false })

    if (accountsError) {
      return NextResponse.json(
        { error: `Failed to fetch accounts: ${accountsError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error: any) {
    console.error('Get platform payment accounts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get platform payment accounts' },
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
    const {
      accountType,
      accountName,
      accountInfo,
      currency = 'USD',
      supportedCurrencies = ['USD'],
    } = body

    // Validate required fields
    if (!accountType || !accountInfo) {
      return NextResponse.json(
        { error: 'Missing required fields: accountType and accountInfo' },
        { status: 400 }
      )
    }

    // Validate account type
    const validAccountTypes = ['stripe', 'paypal', 'alipay', 'wechat']
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

    // Check if platform account of this type already exists
    const { data: existingAccount } = await supabase
      .from('payment_accounts')
      .select('id')
      .eq('is_platform_account', true)
      .eq('account_type', accountType)
      .single()

    if (existingAccount) {
      return NextResponse.json(
        { error: `Platform account of type ${accountType} already exists. Please update or delete the existing one first.` },
        { status: 400 }
      )
    }

    // Create platform payment account
    const { data: newAccount, error: createError } = await supabase
      .from('payment_accounts')
      .insert({
        seller_id: null, // Platform accounts have no seller_id
        account_type: accountType,
        account_name: accountName || `Platform ${accountType} account`,
        account_info: accountInfo,
        currency: currency,
        supported_currencies: supportedCurrencies,
        is_platform_account: true,
        is_verified: true, // Platform accounts are auto-verified
        verification_status: 'verified',
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
    console.error('Create platform payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create platform payment account' },
      { status: 500 }
    )
  }
}
