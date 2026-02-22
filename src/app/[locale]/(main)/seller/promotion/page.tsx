'use client'

import { createClient } from '@/lib/supabase/client'
import { useSellerTierGuard } from '@/lib/hooks/useSellerTierGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { PromotionStatus } from '@/components/seller/PromotionStatus'

export default function SellerPromotionPage() {
  const { user, loading: authLoading, allowed, denyReason, tier, isDirectSeller } = useSellerTierGuard(200)
  const supabase = createClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <p className="text-muted-foreground">
          {denyReason === 'not_seller' && t('needSellerSubscription')}
          {denyReason === 'tier_too_low' && t('needUpgradeTier')}
        </p>
        <Link href="/seller/dashboard">
          <Button variant="outline">{tCommon('back')}</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">推广状态</h1>
        <Link href="/seller/dashboard">
          <Button variant="outline">{tCommon('back')}</Button>
        </Link>
      </div>

      <PromotionStatus userId={user!.id} />
    </div>
  )
}
