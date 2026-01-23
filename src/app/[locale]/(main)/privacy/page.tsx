'use client'

import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export default function PrivacyPage() {
  const t = useTranslations('menu')

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('privacyPolicy')}</h1>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">隐私政策</h2>
          <p className="text-muted-foreground mb-4">
            最后更新日期：2024年1月
          </p>
          <div className="space-y-3 text-muted-foreground">
            <p>
              我们非常重视您的隐私。本隐私政策说明了我们如何收集、使用和保护您的个人信息。
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">信息收集</h3>
            <p>
              我们收集您在使用我们的服务时提供的信息，包括但不限于您的姓名、电子邮件地址和联系方式。
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">信息使用</h3>
            <p>
              我们使用收集的信息来提供、维护和改进我们的服务，以及处理您的交易和请求。
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">信息保护</h3>
            <p>
              我们采取适当的技术和组织措施来保护您的个人信息，防止未经授权的访问、使用或披露。
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
