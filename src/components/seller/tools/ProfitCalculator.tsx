'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from 'next-intl'
import type { Currency } from '@/lib/currency/detect-currency'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ProfitCalculatorProps {
  defaultCost?: number
  defaultPrice?: number
  currency?: Currency
  onProfitChange?: (profit: number, margin: number) => void
}

export function ProfitCalculator({
  defaultCost = 0,
  defaultPrice = 0,
  currency = 'USD',
  onProfitChange,
}: ProfitCalculatorProps) {
  const t = useTranslations('sellerTools')
  const [cost, setCost] = useState<string>(defaultCost.toString())
  const [price, setPrice] = useState<string>(defaultPrice.toString())
  const [profit, setProfit] = useState<number>(0)
  const [margin, setMargin] = useState<number>(0)
  const [status, setStatus] = useState<'profit' | 'breakEven' | 'loss'>('breakEven')

  const calculateProfit = useCallback(() => {
    const costNum = parseFloat(cost) || 0
    const priceNum = parseFloat(price) || 0
    const profitNum = priceNum - costNum
    const marginNum = costNum > 0 ? (profitNum / costNum) * 100 : 0

    setProfit(profitNum)
    setMargin(marginNum)

    if (profitNum > 0) {
      setStatus('profit')
    } else if (profitNum < 0) {
      setStatus('loss')
    } else {
      setStatus('breakEven')
    }

    onProfitChange?.(profitNum, marginNum)
  }, [cost, price, onProfitChange])

  useEffect(() => {
    calculateProfit()
  }, [calculateProfit])

  // Update when default values change
  useEffect(() => {
    setCost(defaultCost.toString())
  }, [defaultCost])

  useEffect(() => {
    setPrice(defaultPrice.toString())
  }, [defaultPrice])

  const getStatusIcon = () => {
    switch (status) {
      case 'profit':
        return <TrendingUp className="h-5 w-5 text-green-500" />
      case 'loss':
        return <TrendingDown className="h-5 w-5 text-red-500" />
      default:
        return <Minus className="h-5 w-5 text-yellow-500" />
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'profit':
        return 'text-green-600'
      case 'loss':
        return 'text-red-600'
      default:
        return 'text-yellow-600'
    }
  }

  const getStatusBg = () => {
    switch (status) {
      case 'profit':
        return 'bg-green-50 border-green-200'
      case 'loss':
        return 'bg-red-50 border-red-200'
      default:
        return 'bg-yellow-50 border-yellow-200'
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cost">{t('cost')} ({currency})</Label>
          <Input
            id="cost"
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">{t('sellingPrice')} ({currency})</Label>
          <Input
            id="price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
      </div>

      <div className={`p-4 rounded-lg border ${getStatusBg()}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{t('profit')}</span>
          {getStatusIcon()}
        </div>
        <div className={`text-2xl font-bold ${getStatusColor()}`}>
          {profit >= 0 ? '+' : ''}
          {currency} {profit.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div className="text-sm mt-1">
          {t('profitMargin')}: {margin >= 0 ? '+' : ''}
          {margin.toFixed(2)}%
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {status === 'profit' && t('profitStatus.profitable')}
        {status === 'loss' && t('profitStatus.loss')}
        {status === 'breakEven' && t('profitStatus.breakEven')}
      </div>
    </div>
  )
}
