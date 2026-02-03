'use client'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title ?? (type === 'seller' ? '成为卖家' : type === 'affiliate' ? '成为带货者' : '打赏功能订阅')}
        </CardTitle>
        <CardDescription>
          {description ?? (type === 'seller' ? '开始销售您的商品' : type === 'affiliate' ? '通过推广商品赚取佣金' : '启用打赏功能，支持您喜欢的创作者')}
        </CardDescription>
        <div className="mt-4">
          <span className="text-3xl font-bold">{formatCurrency(price, currency)}</span>
          <span className="text-muted-foreground">/月</span>
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
            {loading ? (processingLabel ?? '处理中...') : (subscribeLabel ?? '立即订阅')}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
