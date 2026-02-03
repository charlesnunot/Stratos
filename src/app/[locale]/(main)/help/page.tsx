'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { MessageSquare, List, FileText } from 'lucide-react'

export default function HelpPage() {
  const t = useTranslations('help')
  const tMenu = useTranslations('menu')
  const tSupport = useTranslations('support')
  const tPolicies = useTranslations('policies')

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">{t('subtitle')}</h2>
          <p className="text-muted-foreground mb-4">
            {t('intro')}
          </p>
          <div className="space-y-3 text-muted-foreground">
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('policiesTitle')}</h3>
            <p className="mb-2">{t('policiesIntro')}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/privacy">
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  {tPolicies('privacyLink')}
                </Button>
              </Link>
              <Link href="/policies">
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  {tPolicies('pageTitle')}
                </Button>
              </Link>
              <Link href="/seller/deposit/policy">
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  {tPolicies('depositLink')}
                </Button>
              </Link>
            </div>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('faqTitle')}</h3>
            <p>
              {t('faqPlaceholder')}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{t('contactTitle')}</h3>
            <p className="mb-4">
              {t('contactIntro')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/support/tickets/create">
                <Button>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {tSupport('createTicket')}
                </Button>
              </Link>
              <Link href="/support/tickets">
                <Button variant="outline">
                  <List className="mr-2 h-4 w-4" />
                  {tMenu('supportTickets')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
