'use client'

import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export default function HelpPage() {
  const t = useTranslations('menu')

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-6 text-2xl font-bold">{t('help')}</h1>
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-2">帮助与客服</h2>
          <p className="text-muted-foreground mb-4">
            如果您遇到任何问题或需要帮助，请通过以下方式联系我们。
          </p>
          <div className="space-y-3 text-muted-foreground">
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">常见问题</h3>
            <p>
              我们正在整理常见问题解答，敬请期待。
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">联系我们</h3>
            <p>
              如果您需要帮助，请通过应用内的客服工单系统联系我们。
              您可以在导航菜单中找到"客服工单"选项。
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
