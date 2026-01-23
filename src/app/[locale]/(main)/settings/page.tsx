'use client'

import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export default function SettingsPage() {
  const t = useTranslations('menu')
  const tCommon = useTranslations('common')

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('settings')}</h1>
      <Card className="p-6">
        <p className="text-muted-foreground">
          设置页面正在开发中。语言切换功能将很快添加到这里。
        </p>
      </Card>
    </div>
  )
}
