/**
 * Hook to get platform default payment account
 * Used to determine which currency the platform will receive
 */

import { useState, useEffect, useCallback } from 'react'
import type { Currency } from '@/lib/currency/detect-currency'

export interface PlatformAccount {
  accountType: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  currency: Currency
  isActive: boolean
  supportedCurrencies: Currency[]
  defaultForCurrency: boolean
}

interface UsePlatformAccountReturn {
  account: PlatformAccount | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Get platform default payment account for a currency
 * 
 * @param currency - The currency to check
 * @returns Platform account info
 * 
 * @example
 * const { account, loading } = usePlatformAccount('CNY')
 * // account.currency = 'CNY' or 'USD' (platform's receiving currency)
 */
export function usePlatformAccount(currency: Currency): UsePlatformAccountReturn {
  const [account, setAccount] = useState<PlatformAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAccount = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/platform/default-account?currency=${currency}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch platform account')
      }

      const data = await response.json()
      setAccount(data)
    } catch (err) {
      console.error('[usePlatformAccount] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      // Set default fallback
      setAccount({
        accountType: currency === 'CNY' ? 'alipay' : 'stripe',
        currency: currency === 'CNY' ? 'CNY' : 'USD',
        isActive: true,
        supportedCurrencies: currency === 'CNY' ? ['CNY'] : ['USD'],
        defaultForCurrency: true,
      })
    } finally {
      setLoading(false)
    }
  }, [currency])

  useEffect(() => {
    fetchAccount()
  }, [fetchAccount])

  return {
    account,
    loading,
    error,
    refetch: fetchAccount,
  }
}

/**
 * Determine if currency conversion is needed
 * 
 * @param userCurrency - User's selected currency
 * @param platformCurrency - Platform's receiving currency
 * @returns Whether conversion is needed
 */
export function needsCurrencyConversion(
  userCurrency: Currency,
  platformCurrency: Currency
): boolean {
  return userCurrency !== platformCurrency
}

/**
 * Get supported payment methods for a currency combination
 * 
 * @param userCurrency - User's currency
 * @param platformCurrency - Platform's currency
 * @returns Array of supported payment method IDs
 */
export function getSupportedPaymentMethods(
  userCurrency: Currency,
  platformCurrency: Currency
): string[] {
  // If platform only accepts CNY (Alipay/WeChat)
  if (platformCurrency === 'CNY') {
    return ['alipay', 'wechat']
  }

  // If platform accepts USD and other international currencies
  if (platformCurrency === 'USD') {
    if (userCurrency === 'CNY') {
      // Chinese users can still use Alipay/WeChat, but amount will be converted
      return ['stripe', 'paypal', 'alipay', 'wechat']
    }
    return ['stripe', 'paypal']
  }

  // Default
  return ['stripe', 'paypal']
}
