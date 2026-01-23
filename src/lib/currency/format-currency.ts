/**
 * Currency formatting utilities
 * Formats amounts with appropriate currency symbols and decimal places
 */

import type { Currency } from './detect-currency'

interface CurrencyConfig {
  symbol: string
  symbolPosition: 'before' | 'after'
  decimals: number
  thousandsSeparator: string
  decimalSeparator: string
}

const currencyConfigs: Record<Currency, CurrencyConfig> = {
  USD: {
    symbol: '$',
    symbolPosition: 'before',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  CNY: {
    symbol: '¥',
    symbolPosition: 'before',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  EUR: {
    symbol: '€',
    symbolPosition: 'after',
    decimals: 2,
    thousandsSeparator: '.',
    decimalSeparator: ',',
  },
  GBP: {
    symbol: '£',
    symbolPosition: 'before',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  JPY: {
    symbol: '¥',
    symbolPosition: 'before',
    decimals: 0,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  KRW: {
    symbol: '₩',
    symbolPosition: 'before',
    decimals: 0,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  SGD: {
    symbol: 'S$',
    symbolPosition: 'before',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  HKD: {
    symbol: 'HK$',
    symbolPosition: 'before',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  AUD: {
    symbol: 'A$',
    symbolPosition: 'before',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
  CAD: {
    symbol: 'C$',
    symbolPosition: 'before',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
  },
}

/**
 * Format currency amount with symbol and proper formatting
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const config = currencyConfigs[currency] || currencyConfigs.USD

  // Format number with appropriate decimals
  const formattedNumber = amount.toFixed(config.decimals)

  // Split into integer and decimal parts
  const [integerPart, decimalPart] = formattedNumber.split('.')

  // Add thousands separator
  const integerWithSeparator = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    config.thousandsSeparator
  )

  // Combine parts
  const numberString =
    config.decimals > 0
      ? `${integerWithSeparator}${config.decimalSeparator}${decimalPart}`
      : integerWithSeparator

  // Add currency symbol
  if (config.symbolPosition === 'before') {
    return `${config.symbol}${numberString}`
  } else {
    return `${numberString} ${config.symbol}`
  }
}

/**
 * Format currency without symbol (just the number)
 */
export function formatCurrencyAmount(amount: number, currency: Currency): string {
  const config = currencyConfigs[currency] || currencyConfigs.USD
  const formattedNumber = amount.toFixed(config.decimals)
  const [integerPart, decimalPart] = formattedNumber.split('.')

  const integerWithSeparator = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    config.thousandsSeparator
  )

  return config.decimals > 0
    ? `${integerWithSeparator}${config.decimalSeparator}${decimalPart}`
    : integerWithSeparator
}
