/**
 * Platform default payment account API
 * Returns the default payment account for a given currency
 * Used to determine which currency the platform will receive
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Currency } from '@/lib/currency/detect-currency'

export interface PlatformAccountResponse {
  accountType: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  currency: Currency
  isActive: boolean
  supportedCurrencies: Currency[]
  defaultForCurrency: boolean
}

/**
 * Get platform default payment account for a currency
 * 
 * Query params:
 * - currency: The currency to check (e.g., 'USD', 'CNY')
 * 
 * Returns the default payment account that will receive payments in that currency
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const currency = (searchParams.get('currency') || 'USD') as Currency

    const supabase = await createClient()

    // Query platform payment accounts
    const { data: accounts, error } = await supabase
      .rpc('get_platform_payment_account', {
        p_currency: currency,
        p_account_type: null, // Get all account types
      })

    if (error) {
      console.error('[Platform Account API] Error:', error)
      return NextResponse.json(
        { error: 'Failed to get platform account' },
        { status: 500 }
      )
    }

    if (!accounts || accounts.length === 0) {
      // No platform account configured, return default based on currency
      const defaultAccount: PlatformAccountResponse = {
        accountType: currency === 'CNY' ? 'alipay' : 'stripe',
        currency: currency,
        isActive: true,
        supportedCurrencies: currency === 'CNY' 
          ? ['CNY'] 
          : ['USD', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'],
        defaultForCurrency: true,
      }
      return NextResponse.json(defaultAccount)
    }

    // Find the best matching account
    // Priority: 1) Exact currency match, 2) USD account, 3) First available
    const exactMatch = accounts.find((a: any) => a.currency === currency)
    const usdAccount = accounts.find((a: any) => a.currency === 'USD')
    const selectedAccount = exactMatch || usdAccount || accounts[0]

    const accountInfo = selectedAccount.account_info as any || {}

    const response: PlatformAccountResponse = {
      accountType: selectedAccount.account_type as PlatformAccountResponse['accountType'],
      currency: (selectedAccount.currency as Currency) || currency,
      isActive: selectedAccount.is_active ?? true,
      supportedCurrencies: accountInfo.supported_currencies || [selectedAccount.currency || 'USD'],
      defaultForCurrency: selectedAccount.currency === currency,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Platform Account API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get platform account' },
      { status: 500 }
    )
  }
}

/**
 * Get all platform payment accounts
 * Useful for admin interfaces
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: accounts, error } = await supabase
      .from('platform_payment_accounts')
      .select('*')
      .eq('is_active', true)
      .order('currency', { ascending: true })

    if (error) {
      console.error('[Platform Account API] Error:', error)
      return NextResponse.json(
        { error: 'Failed to get platform accounts' },
        { status: 500 }
      )
    }

    const responses: PlatformAccountResponse[] = (accounts || []).map((account: any) => {
      const accountInfo = account.account_info as any || {}
      return {
        accountType: account.account_type,
        currency: account.currency as Currency,
        isActive: account.is_active,
        supportedCurrencies: accountInfo.supported_currencies || [account.currency],
        defaultForCurrency: account.is_default ?? false,
      }
    })

    return NextResponse.json({ accounts: responses })
  } catch (error) {
    console.error('[Platform Account API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get platform accounts' },
      { status: 500 }
    )
  }
}
