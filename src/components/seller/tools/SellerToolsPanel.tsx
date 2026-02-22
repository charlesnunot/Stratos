'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Currency } from '@/lib/currency/detect-currency'
import { CurrencyConverter } from './CurrencyConverter'
import { ProfitCalculator } from './ProfitCalculator'
import { MultiCurrencyPricing } from './MultiCurrencyPricing'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Wallet, TrendingUp, Globe, ArrowRightLeft } from 'lucide-react'

interface SellerToolsPanelProps {
  defaultPrice?: number
  defaultCurrency?: Currency
  defaultOpenTool?: 'converter' | 'profit' | 'multiMarket' | 'all'
  syncWithForm?: boolean
  onPriceChange?: (price: number) => void
  className?: string
}

export function SellerToolsPanel({
  defaultPrice = 100,
  defaultCurrency = 'USD',
  defaultOpenTool = 'converter',
  syncWithForm = true,
  onPriceChange,
  className,
}: SellerToolsPanelProps) {
  const t = useTranslations('sellerTools')
  const [openConverter, setOpenConverter] = useState(defaultOpenTool === 'converter' || defaultOpenTool === 'all')
  const [openProfit, setOpenProfit] = useState(defaultOpenTool === 'profit' || defaultOpenTool === 'all')
  const [openMultiMarket, setOpenMultiMarket] = useState(defaultOpenTool === 'multiMarket' || defaultOpenTool === 'all')
  const [currentPrice, setCurrentPrice] = useState(defaultPrice)

  const handleConverterAmountChange = (amount: number) => {
    if (syncWithForm) {
      setCurrentPrice(amount)
      onPriceChange?.(amount)
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <Wallet className="h-5 w-5" />
        {t('title')}
      </h3>

      {/* Currency Converter */}
      <Collapsible open={openConverter} onOpenChange={setOpenConverter}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            <span className="font-medium">{t('currencyConverter')}</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${openConverter ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="p-3 pt-4 border rounded-b-md border-t-0">
          <CurrencyConverter
            defaultAmount={currentPrice}
            defaultFrom={defaultCurrency}
            onAmountChange={handleConverterAmountChange}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Profit Calculator */}
      <Collapsible open={openProfit} onOpenChange={setOpenProfit}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <span className="font-medium">{t('profitCalculator')}</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${openProfit ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="p-3 pt-4 border rounded-b-md border-t-0">
          <ProfitCalculator
            defaultPrice={currentPrice}
            currency={defaultCurrency}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Multi-Currency Pricing */}
      <Collapsible open={openMultiMarket} onOpenChange={setOpenMultiMarket}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-md bg-muted hover:bg-muted/80 transition-colors">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <span className="font-medium">{t('multiCurrencyPricing')}</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${openMultiMarket ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="p-3 pt-4 border rounded-b-md border-t-0">
          <MultiCurrencyPricing
            basePrice={currentPrice}
            baseCurrency={defaultCurrency}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
