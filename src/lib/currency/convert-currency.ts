/**
 * Currency conversion utilities
 * Converts amounts between currencies using fallback rates.
 * Display: use these rates; payment uses Stripe/PayPal at checkout.
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
 * Convert amount from one currency to another.
 * Uses fallback rates when exchange_rates table is not populated.
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

function roundByCurrency(value: number, currency: Currency): number {
  const decimals = ['JPY', 'KRW'].includes(currency) ? 0 : 2
  const m = Math.pow(10, decimals)
  return Math.round(value * m) / m
}
