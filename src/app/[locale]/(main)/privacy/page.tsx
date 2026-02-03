'use client'

import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export default function PrivacyPage() {
  const t = useTranslations('privacy')

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">{t('pageTitle')}</h2>
          <p className="text-muted-foreground mb-4">
            {t('lastUpdated')}
          </p>
          <div className="space-y-3 text-muted-foreground">
            <p>
              {t('intro')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('collectTitle')}</h3>
            <p>
              {t('collectContent')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('useTitle')}</h3>
            <p>
              {t('useContent')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('protectTitle')}</h3>
            <p>
              {t('protectContent')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('thirdPartyTitle')}</h3>
            <p>
              {t('thirdPartyContent')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('cookiesTitle')}</h3>
            <p>
              {t('cookiesContent')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('rightsTitle')}</h3>
            <p>
              {t('rightsContent')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('contactTitle')}</h3>
            <p>
              {t('contactContent')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
