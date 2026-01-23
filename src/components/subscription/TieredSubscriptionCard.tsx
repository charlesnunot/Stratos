/**
 * Tiered subscription card component for seller subscriptions
 * Supports multiple tiers: 5/15/40/80/200 USD/month (新生平台定价)
 */

'use client'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

export interface SubscriptionTier {
  tier: number // 5, 15, 40, 80, 200 (档位 id，与 deposit_credit 一致)
  price: number
  depositCredit: number
  features: string[]
  recommended?: boolean
}

interface TieredSubscriptionCardProps {
  tiers: SubscriptionTier[]
  currentTier?: number
  currency?: Currency
  onSelectTier: (tier: number) => void
  loading?: boolean
}

export function TieredSubscriptionCard({
  tiers,
  currentTier,
  currency = 'USD',
  onSelectTier,
  loading = false,
}: TieredSubscriptionCardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tiers.map((tier) => {
        const isCurrentTier = currentTier === tier.tier
        const isUpgrade = currentTier && tier.tier > currentTier
        const isDowngrade = currentTier && tier.tier < currentTier

        return (
          <Card
            key={tier.tier}
            className={`relative ${tier.recommended ? 'border-primary shadow-lg' : ''} ${isCurrentTier ? 'border-green-500' : ''}`}
          >
            {tier.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  推荐
                </span>
              </div>
            )}
            {isCurrentTier && (
              <div className="absolute -top-3 right-3">
                <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-semibold text-white">
                  当前
                </span>
              </div>
            )}
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {formatCurrency(tier.price, currency)}/月
              </CardTitle>
              <CardDescription>
                免费保证金额度: {formatCurrency(tier.depositCredit, currency)}
              </CardDescription>
              <div className="mt-2">
                <span className="text-2xl font-bold">{formatCurrency(tier.price, currency)}</span>
                <span className="text-muted-foreground">/月</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={() => onSelectTier(tier.tier)}
                disabled={loading || isCurrentTier}
                variant={isCurrentTier ? 'outline' : 'default'}
              >
                {loading
                  ? '处理中...'
                  : isCurrentTier
                    ? '当前档位'
                    : isUpgrade
                      ? '升级'
                      : isDowngrade
                        ? '降级'
                        : '选择'}
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
