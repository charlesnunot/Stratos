'use client'

import { NotificationList } from '@/components/notification/NotificationList'
import { useTranslations } from 'next-intl'

export default function NotificationsPage() {
  const t = useTranslations('notifications')
  
  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>
      <NotificationList onClose={() => {}} isFullPage={true} />
    </div>
  )
}
