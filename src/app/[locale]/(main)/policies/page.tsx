'use client'

import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export default function PoliciesPage() {
  const t = useTranslations('policies')

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>

      <div className="flex flex-wrap gap-3">
        <Link href="/privacy">
          <span className="text-primary underline hover:no-underline">{t('privacyLink')}</span>
        </Link>
        <span className="text-muted-foreground">|</span>
        <Link href="/seller/deposit/policy">
          <span className="text-primary underline hover:no-underline">{t('depositLink')}</span>
        </Link>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">{t('sellerTitle')}</h2>
        <p className="text-muted-foreground">{t('sellerIntro')}</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('sellerWho')}</p>
          <p>{t('sellerDeposit')}</p>
          <p>{t('sellerConduct')}</p>
          <p>{t('sellerDisputes')}</p>
          <p>{t('sellerPayouts')}</p>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">{t('subscriptionTitle')}</h2>
        <p className="text-muted-foreground">{t('subscriptionIntro')}</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('subscriptionSeller')}</p>
          <p>{t('subscriptionAffiliate')}</p>
          <p>{t('subscriptionTip')}</p>
          <p>{t('subscriptionRenewal')}</p>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">{t('affiliateTitle')}</h2>
        <p className="text-muted-foreground">{t('affiliateIntro')}</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('affiliateEligibility')}</p>
          <p>{t('affiliateCommission')}</p>
          <p>{t('affiliateContent')}</p>
          <p>{t('affiliatePayouts')}</p>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">{t('tipTitle')}</h2>
        <p className="text-muted-foreground">{t('tipIntro')}</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('tipEligibility')}</p>
          <p>{t('tipUsage')}</p>
          <p>{t('tipConduct')}</p>
        </div>
      </Card>
    </div>
  )
}
