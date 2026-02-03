/**
 * Platform payment accounts management API
 * Allows admins to manage platform payment accounts (Stripe, PayPal, Alipay, WeChat)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export async function GET(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { supabase } = authResult.data

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
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { supabase } = authResult.data

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

    // Check if active platform account of this type already exists
    // Only active accounts have uniqueness constraint
    const { data: existingAccount } = await supabase
      .from('payment_accounts')
      .select('id, status')
      .eq('is_platform_account', true)
      .eq('account_type', accountType)
      .eq('status', 'active')
      .maybeSingle()

    if (existingAccount) {
      return NextResponse.json(
        { error: `An active platform account of type ${accountType} already exists. Please disable the existing one first.` },
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
        status: 'active', // New accounts are active by default
      })
      .select()
      .single()

    if (createError) {
      logAudit({
        action: 'platform_account_crud',
        userId: authResult.data.user.id,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { op: 'create', reason: createError.message },
      })
      return NextResponse.json(
        { error: `Failed to create account: ${createError.message}` },
        { status: 500 }
      )
    }

    logAudit({
      action: 'platform_account_crud',
      userId: authResult.data.user.id,
      resourceId: newAccount.id,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { op: 'create' },
    })

    return NextResponse.json({ account: newAccount }, { status: 201 })
  } catch (error: any) {
    console.error('Create platform payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create platform payment account' },
      { status: 500 }
    )
  }
}
