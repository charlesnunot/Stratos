/**
 * Currency conversion utilities
 * Supports both synchronous (fallback) and asynchronous (database) conversion
 * 
 * Usage:
 * - Server-side rendering: use convertCurrency() with fallback rates
 * - Client-side: use convertCurrencyAsync() to query real-time rates from API
 * - Payment processing: use getExchangeRate() to get current rate before locking
 */

import type { Currency } from './detect-currency'

/** USD to target currency. Used when base is USD. */
const FALLBACK_RATES: Record<Exclude<Currency, 'USD'>, number> = {
  CNY: 7.2,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 150,
  KRW: 1300,
  SGD: 1.34,
  HKD: 7.82,
  AUD: 1.53,
  CAD: 1.36,
}

/**
 * Convert amount from one currency to another (Synchronous - uses fallback rates)
 * Use this for server-side rendering or when you don't need real-time rates
 * 
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @returns Converted amount
 */
export function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): number {
  if (fromCurrency === toCurrency) return amount

  let amountInUsd: number
  if (fromCurrency === 'USD') {
    amountInUsd = amount
  } else {
    const rateToUsd = 1 / (FALLBACK_RATES[fromCurrency] ?? 1)
    amountInUsd = amount * rateToUsd
  }

  if (toCurrency === 'USD') return roundByCurrency(amountInUsd, 'USD')

  const rate = FALLBACK_RATES[toCurrency] ?? 1
  return roundByCurrency(amountInUsd * rate, toCurrency)
}

/**
 * Get exchange rate from API (Asynchronous)
 * Queries the database for real-time exchange rates
 * 
 * @param from - Source currency
 * @param to - Target currency
 * @returns Exchange rate (how many 'to' units per 1 'from' unit)
 */
export async function getExchangeRate(
  from: Currency,
  to: Currency
): Promise<number> {
  if (from === to) return 1

  try {
    const response = await fetch(`/api/exchange-rates?from=${from}&to=${to}`)
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rate')
    }
    const data = await response.json()
    return data.rate as number
  } catch (error) {
    console.error('[getExchangeRate] Error, using fallback:', error)
    // Fallback to synchronous conversion
    return convertCurrency(1, from, to)
  }
}

/**
 * Convert amount using real-time exchange rates (Asynchronous)
 * Use this for client-side display where accuracy matters
 * 
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @returns Converted amount
 */
export async function convertCurrencyAsync(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): Promise<number> {
  if (fromCurrency === toCurrency) return amount

  try {
    const rate = await getExchangeRate(fromCurrency, toCurrency)
    return roundByCurrency(amount * rate, toCurrency)
  } catch (error) {
    console.error('[convertCurrencyAsync] Error, using fallback:', error)
    return convertCurrency(amount, fromCurrency, toCurrency)
  }
}

/**
 * Batch convert multiple amounts (Asynchronous)
 * More efficient than multiple individual calls
 * 
 * @param conversions - Array of {amount, from, to}
 * @returns Array of converted amounts in same order
 */
export async function convertCurrencyBatch(
  conversions: Array<{
    amount: number
    from: Currency
    to: Currency
  }>
): Promise<number[]> {
  try {
    const response = await fetch('/api/exchange-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairs: conversions.map(c => ({ from: c.from, to: c.to }))
      })
    })

    if (!response.ok) {
      throw new Error('Failed to fetch batch exchange rates')
    }

    const data = await response.json()
    const rates = data.rates as Array<{ rate: number }>
    
    return conversions.map((c, i) => 
      roundByCurrency(c.amount * (rates[i]?.rate ?? 1), c.to)
    )
  } catch (error) {
    console.error('[convertCurrencyBatch] Error, using fallback:', error)
    // Fallback to synchronous conversion
    return conversions.map(c => convertCurrency(c.amount, c.from, c.to))
  }
}

/**
 * Format amount with currency symbol for display
 * Includes both original and converted amount for multi-currency display
 * 
 * @param amount - Original amount
 * @param fromCurrency - Original currency
 * @param toCurrency - Target currency for display
 * @returns Formatted string like "$100.00 (约 ¥720.00)"
 */
export async function formatMultiCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): Promise<string> {
  const { formatCurrency } = await import('./format-currency')
  
  const original = formatCurrency(amount, fromCurrency)
  
  if (fromCurrency === toCurrency) {
    return original
  }
  
  const converted = await convertCurrencyAsync(amount, fromCurrency, toCurrency)
  const convertedFormatted = formatCurrency(converted, toCurrency)
  
  return `${original} (≈ ${convertedFormatted})`
}

function roundByCurrency(value: number, currency: Currency): number {
  const decimals = ['JPY', 'KRW'].includes(currency) ? 0 : 2
  const m = Math.pow(10, decimals)
  return Math.round(value * m) / m
}
