'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { Currency } from '@/lib/currency/detect-currency'
import { convertCurrency } from '@/lib/currency/convert-currency'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useRef } from 'react'

const CURRENCIES: Currency[] = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']

const CURRENCY_FLAGS: Record<Currency, string> = {
  USD: '🇺🇸',
  CNY: '🇨🇳',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  JPY: '🇯🇵',
  KRW: '🇰🇷',
  SGD: '🇸🇬',
  HKD: '🇭🇰',
  AUD: '🇦🇺',
  CAD: '🇨🇦',
}

const CURRENCY_NAMES: Record<Currency, string> = {
  USD: 'US Dollar',
  CNY: 'Chinese Yuan',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  KRW: 'Korean Won',
  SGD: 'Singapore Dollar',
  HKD: 'Hong Kong Dollar',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
}

interface MultiCurrencyPricingProps {
  basePrice: number
  baseCurrency: Currency
  showAll?: boolean
}

export function MultiCurrencyPricing({
  basePrice,
  baseCurrency,
  showAll = false,
}: MultiCurrencyPricingProps) {
  const t = useTranslations('sellerTools')
  const [showAllCurrencies, setShowAllCurrencies] = useState(showAll)
  const scrollRef = useRef<HTMLDivElement>(null)

  const prices = useMemo(() => {
    return CURRENCIES.map((currency) => ({
      currency,
      price: convertCurrency(basePrice, baseCurrency, currency),
      flag: CURRENCY_FLAGS[currency],
      name: CURRENCY_NAMES[currency],
    }))
  }, [basePrice, baseCurrency])

  const displayPrices = showAllCurrencies ? prices : prices.slice(0, 4)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {t('basePrice')}: {CURRENCY_FLAGS[baseCurrency]} {basePrice.toLocaleString()} {baseCurrency}
      </div>

      {/* Desktop: Grid layout */}
      <div className="hidden sm:grid grid-cols-2 gap-2">
        {displayPrices.map(({ currency, price, flag }) => (
          <div
            key={currency}
            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{flag}</span>
              <span className="text-sm font-medium">{currency}</span>
            </div>
            <span className="text-sm">
              {price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        ))}
      </div>

      {/* Mobile: Horizontal scroll */}
      <div className="sm:hidden relative">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full bg-background shadow-md"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide px-6"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {displayPrices.map(({ currency, price, flag }) => (
            <div
              key={currency}
              className="flex-shrink-0 flex flex-col items-center p-3 rounded-md bg-muted/50 min-w-[80px]"
            >
              <span className="text-2xl mb-1">{flag}</span>
              <span className="text-xs font-medium">{currency}</span>
              <span className="text-sm mt-1">
                {price.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full bg-background shadow-md"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Show all / Collapse button */}
      {!showAll && prices.length > 4 && (
        <button
          onClick={() => setShowAllCurrencies(!showAllCurrencies)}
          className="text-sm text-primary hover:underline w-full text-center"
        >
          {showAllCurrencies ? t('collapse') : t('viewAll')}
        </button>
      )}
    </div>
  )
}
