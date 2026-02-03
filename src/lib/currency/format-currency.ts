/**
 * Currency formatting utilities
 * Formats amounts with appropriate currency symbols and decimal places
 */

import type { Currency } from './detect-currency'
import { convertCurrency } from './convert-currency'

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

/**
 * Result for displaying price in user's locale currency.
 * 国际化展示：只显示用户语言对应的货币（英文美金、中文人民币等），不做「原价 + ≈ 参考价」双行展示。
 */
export interface PriceWithConversionDisplay {
  /** 换算后的价格，以用户本地货币格式化展示（如英文 $10.00、中文 ¥72.00） */
  main: string
  /** 已废弃，始终为 undefined，不再展示「≈ 参考价」 */
  approx: string | undefined
}

/**
 * 按用户本地货币展示商品价格（自动汇率换算，单行展示）。
 * 英文环境显示美金，中文环境显示人民币等，不展示「≈ ¥72.00」形式的参考价，以提升体验。
 * 结算仍以商品货币为准。
 */
export function formatPriceWithConversion(
  price: number,
  productCurrency: Currency,
  userCurrency: Currency
): PriceWithConversionDisplay {
  const converted = convertCurrency(price, productCurrency, userCurrency)
  const main = formatCurrency(converted, userCurrency)
  return { main, approx: undefined }
}
