'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from 'next-intl'
import type { Currency } from '@/lib/currency/detect-currency'
import { convertCurrency } from '@/lib/currency/convert-currency'
import { ArrowRightLeft } from 'lucide-react'

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

interface CurrencyConverterProps {
  defaultAmount?: number
  defaultFrom?: Currency
  defaultTo?: Currency
  onAmountChange?: (amount: number) => void
}

export function CurrencyConverter({
  defaultAmount = 100,
  defaultFrom = 'USD',
  defaultTo = 'CNY',
  onAmountChange,
}: CurrencyConverterProps) {
  const t = useTranslations('sellerTools')
  const [amount, setAmount] = useState<string>(defaultAmount.toString())
  const [fromCurrency, setFromCurrency] = useState<Currency>(defaultFrom)
  const [toCurrency, setToCurrency] = useState<Currency>(defaultTo)
  const [convertedAmount, setConvertedAmount] = useState<number>(0)

  const handleConvert = useCallback(() => {
    const numAmount = parseFloat(amount) || 0
    const result = convertCurrency(numAmount, fromCurrency, toCurrency)
    setConvertedAmount(result)
  }, [amount, fromCurrency, toCurrency])

  useEffect(() => {
    handleConvert()
  }, [handleConvert])

  const handleAmountChange = (value: string) => {
    setAmount(value)
    const numValue = parseFloat(value) || 0
    onAmountChange?.(numValue)
  }

  const handleSwap = () => {
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="amount">{t('amount')}</Label>
        <Input
          id="amount"
          type="number"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
        />
      </div>

      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
        <div className="space-y-2">
          <Label>{t('fromCurrency')}</Label>
          <Select value={fromCurrency} onValueChange={(v) => setFromCurrency(v as Currency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  <span className="mr-2">{CURRENCY_FLAGS[currency]}</span>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          onClick={handleSwap}
          className="p-2 rounded-md hover:bg-accent transition-colors"
          title={t('swap')}
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>

        <div className="space-y-2">
          <Label>{t('toCurrency')}</Label>
          <Select value={toCurrency} onValueChange={(v) => setToCurrency(v as Currency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  <span className="mr-2">{CURRENCY_FLAGS[currency]}</span>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="pt-4 border-t">
        <div className="text-sm text-muted-foreground">{t('result')}</div>
        <div className="text-2xl font-bold">
          {CURRENCY_FLAGS[toCurrency]} {convertedAmount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          1 {fromCurrency} ≈ {convertCurrency(1, fromCurrency, toCurrency).toFixed(4)} {toCurrency}
        </div>
      </div>
    </div>
  )
}
