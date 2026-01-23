/**
 * Currency detection and default value strategy
 * Detects user's preferred currency based on various factors
 */

export type Currency = 'USD' | 'CNY' | 'EUR' | 'GBP' | 'JPY' | 'KRW' | 'SGD' | 'HKD' | 'AUD' | 'CAD'

export interface CurrencyDetectionOptions {
  productCurrency?: Currency
  userPreferredCurrency?: Currency
  browserLocale?: string
  ipCountry?: string
}

/**
 * Detect currency based on priority:
 * 1. Product currency (highest priority)
 * 2. User preferred currency
 * 3. Browser locale
 * 4. IP country (optional)
 * 5. Default USD
 */
export function detectCurrency(options: CurrencyDetectionOptions): Currency {
  // Priority 1: Product currency
  if (options.productCurrency) {
    return options.productCurrency
  }

  // Priority 2: User preferred currency
  if (options.userPreferredCurrency) {
    return options.userPreferredCurrency
  }

  // Priority 3: Browser locale
  if (options.browserLocale) {
    const locale = options.browserLocale.toLowerCase()
    if (locale.includes('zh-cn') || locale.includes('zh')) {
      return 'CNY'
    }
    if (locale.includes('en-us') || locale.includes('en')) {
      return 'USD'
    }
    if (locale.includes('en-gb')) {
      return 'GBP'
    }
    if (locale.includes('ja')) {
      return 'JPY'
    }
    if (locale.includes('ko')) {
      return 'KRW'
    }
    if (locale.includes('de') || locale.includes('fr') || locale.includes('es') || locale.includes('it')) {
      return 'EUR'
    }
  }

  // Priority 4: IP country (if provided)
  if (options.ipCountry) {
    const country = options.ipCountry.toUpperCase()
    const countryCurrencyMap: Record<string, Currency> = {
      CN: 'CNY',
      US: 'USD',
      GB: 'GBP',
      JP: 'JPY',
      KR: 'KRW',
      SG: 'SGD',
      HK: 'HKD',
      AU: 'AUD',
      CA: 'CAD',
    }
    if (countryCurrencyMap[country]) {
      return countryCurrencyMap[country]
    }
  }

  // Priority 5: Default USD
  return 'USD'
}

/**
 * Get currency from browser locale
 */
export function getCurrencyFromBrowser(): Currency {
  if (typeof window === 'undefined') {
    return 'USD'
  }

  const locale = navigator.language || (navigator as any).userLanguage || 'en-US'
  return detectCurrency({ browserLocale: locale })
}
