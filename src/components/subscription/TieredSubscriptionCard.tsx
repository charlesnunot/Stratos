/**
 * Tiered subscription card component for seller subscriptions
 * 3档纯净模式: Starter ($15) / Growth ($79) / Scale ($199)
 */

'use client'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Sparkles, Package } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

export interface FeatureGroup {
  title: string
  features: string[]
}

export interface SubscriptionTier {
  tier: number // 15, 50, 100 (内部 tier 值，与保证金额度一致)
  price: number // 实际支付价格
  displayPrice: number // 显示价格（可能不同于 tier，如 Growth 显示 $49 但 tier 是 50）
  depositCredit: number
  features: string[]
  featureGroups?: FeatureGroup[]
  recommended?: boolean
  name?: string
  subtitle?: string
  productLimit?: number
}

interface TieredSubscriptionCardProps {
  tiers: SubscriptionTier[]
  currentTier?: number
  selectedTier?: number // 用户选中的档位
  currency?: Currency
  onSelectTier: (tier: number) => void
  loading?: boolean
  isFirstMonth?: boolean // 是否首月（显示折扣）
}

export function TieredSubscriptionCard({
  tiers,
  currentTier,
  selectedTier,
  currency = 'USD',
  onSelectTier,
  loading = false,
  isFirstMonth = false,
}: TieredSubscriptionCardProps) {
  const t = useTranslations('subscription')
  const tSeller = useTranslations('subscriptionSeller')

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {tiers.map((tier) => {
        const isCurrentTier = currentTier === tier.tier
        const isSelected = selectedTier === tier.tier
        const isUpgrade = currentTier && tier.tier > currentTier
        const isDowngrade = currentTier && tier.tier < currentTier

        return (
          <Card
            key={tier.tier}
            className={`relative flex flex-col transition-all duration-200 ${
              tier.recommended 
                ? 'border-primary shadow-lg scale-105 z-10' 
                : 'border-border'
            } ${isCurrentTier ? 'border-green-500' : ''} ${
              isSelected && !isCurrentTier 
                ? 'ring-2 ring-primary ring-offset-2 border-primary shadow-lg' 
                : ''
            }`}
          >
            {/* 推荐标签 */}
            {tier.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground shadow-md">
                  ★ {t('recommended')}
                </span>
              </div>
            )}

            {/* 当前档位标签 */}
            {isCurrentTier && (
              <div className="absolute -top-3 right-3">
                <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-semibold text-white shadow-md">
                  {t('current')}
                </span>
              </div>
            )}

            {/* 已选中标签 */}
            {isSelected && !isCurrentTier && (
              <div className="absolute -top-3 right-3">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-md">
                  {t('selected')}
                </span>
              </div>
            )}

            <CardHeader className="pb-4">
              {/* 档位名称 */}
              {tier.name && (
                <div className="text-sm font-medium text-primary mb-1 uppercase tracking-wide">
                  {tier.name}
                </div>
              )}

              {/* 价格显示 */}
              <CardTitle className="flex items-baseline gap-1 text-3xl font-bold">
                {isFirstMonth && tier.displayPrice !== tier.price ? (
                  <>
                    <span className="text-muted-foreground line-through text-lg">
                      {formatCurrency(tier.displayPrice, currency)}
                    </span>
                    <span className="text-primary">
                      {formatCurrency(tier.displayPrice * 0.5, currency)}
                    </span>
                  </>
                ) : (
                  <span>{formatCurrency(tier.displayPrice, currency)}</span>
                )}
                <span className="text-base font-normal text-muted-foreground">{t('perMonth')}</span>
              </CardTitle>

              {/* 副标题 */}
              {tier.subtitle && (
                <CardDescription className="text-sm mt-1">
                  {tier.subtitle}
                </CardDescription>
              )}

              {/* 首月折扣标签 */}
              {isFirstMonth && (
                <div className="mt-2">
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                    {tSeller('discount.firstMonth', { percent: '50' })}
                  </span>
                </div>
              )}

              {/* 商品数量 */}
              {tier.productLimit && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
                  <Package className="h-4 w-4" />
                  <span>
                    {tSeller('features.productLimit', { count: tier.productLimit })}
                  </span>
                </div>
              )}
            </CardHeader>

            <CardContent className="flex-1">
              {/* 功能分组显示 */}
              {tier.featureGroups ? (
                <div className="space-y-4">
                  {tier.featureGroups.map((group, groupIndex) => (
                    <div key={groupIndex}>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        {group.title}
                      </h4>
                      <ul className="space-y-2">
                        {group.features.map((feature, featureIndex) => (
                          <li key={featureIndex} className="flex items-start gap-2">
                            <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                /* 扁平功能列表（兼容旧数据） */
                <ul className="space-y-2">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                className="w-full"
                onClick={() => onSelectTier(tier.tier)}
                disabled={loading || isCurrentTier}
                variant={isCurrentTier ? 'outline' : 'default'}
                size="lg"
              >
                {loading
                  ? t('processing')
                  : isCurrentTier
                    ? t('currentTier')
                    : isUpgrade
                      ? t('upgrade')
                      : isDowngrade
                        ? t('downgrade')
                        : t('select')}
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
