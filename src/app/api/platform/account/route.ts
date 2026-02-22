/**
 * API to get platform payment account information
 * Returns the platform's receiving currency and available payment methods
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

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const currency = searchParams.get('currency') || 'USD'

    // Query platform payment accounts for the specified currency
    const { data: accounts, error } = await supabase.rpc('get_platform_payment_account', {
      p_currency: currency,
    })

    if (error) {
      console.error('Error fetching platform account:', error)
      return NextResponse.json(
        { error: 'Failed to fetch platform account' },
        { status: 500 }
      )
    }

    // If no account found for the specific currency, try to get any active account
    let account = accounts?.[0]
    
    if (!account) {
      // Try to get any active platform account
      const { data: anyAccounts, error: anyError } = await supabase
        .from('platform_payment_accounts')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single()

      if (!anyError && anyAccounts) {
        account = anyAccounts
      }
    }

    // Default fallback
    const result = account
      ? {
          currency: account.currency || 'USD',
          accountType: account.account_type,
          isActive: account.is_active,
          supportedMethods: getSupportedMethods(account.currency || 'USD'),
        }
      : {
          currency: 'USD',
          accountType: 'stripe',
          isActive: true,
          supportedMethods: ['stripe', 'paypal'],
        }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in platform account API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Get supported payment methods for a currency
 */
function getSupportedMethods(currency: string): string[] {
  const methodsByCurrency: Record<string, string[]> = {
    'CNY': ['alipay', 'wechat', 'stripe', 'paypal'],
    'USD': ['stripe', 'paypal'],
    'EUR': ['stripe', 'paypal'],
    'GBP': ['stripe', 'paypal'],
    'JPY': ['stripe', 'paypal'],
    'KRW': ['stripe', 'paypal'],
    'SGD': ['stripe', 'paypal'],
    'HKD': ['stripe', 'paypal'],
    'AUD': ['stripe', 'paypal'],
    'CAD': ['stripe', 'paypal'],
  }

  return methodsByCurrency[currency] || ['stripe', 'paypal']
}
