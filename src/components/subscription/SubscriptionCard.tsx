'use client'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { useTranslations } from 'next-intl'

interface SubscriptionCardProps {
  type: 'seller' | 'affiliate' | 'tip'
  price: number
  currency?: Currency
  features: string[]
  onSubscribe: () => void
  loading?: boolean
  /** When true, hide subscribe button and show usePayPalHint (e.g. PayPal selected) */
  hideSubscribeButton?: boolean
  usePayPalHint?: string
  title?: string
  description?: string
  subscribeLabel?: string
  processingLabel?: string
}

export function SubscriptionCard({
  type,
  price,
  currency = 'USD',
  features,
  onSubscribe,
  loading,
  hideSubscribeButton,
  usePayPalHint,
  title,
  description,
  subscribeLabel,
  processingLabel,
}: SubscriptionCardProps) {
  const t = useTranslations('subscription')
  const tCommon = useTranslations('common')

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title ?? (type === 'seller' ? t('sellerTitle') : type === 'affiliate' ? t('affiliateTitle') : t('tipTitle'))}
        </CardTitle>
        <CardDescription>
          {description ?? (type === 'seller' ? t('sellerDescription') : type === 'affiliate' ? t('affiliateDescription') : t('tipDescription'))}
        </CardDescription>
        <div className="mt-4">
          <span className="text-3xl font-bold">{formatCurrency(price, currency)}</span>
          <span className="text-muted-foreground">{t('perMonth')}</span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        {hideSubscribeButton && usePayPalHint ? (
          <p className="text-sm text-muted-foreground w-full text-center py-2">{usePayPalHint}</p>
        ) : (
          <Button className="w-full" onClick={onSubscribe} disabled={loading}>
            {loading ? (processingLabel ?? t('processing')) : (subscribeLabel ?? t('subscribeNow'))}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
