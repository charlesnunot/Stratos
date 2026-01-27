'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { MessageSquare, List } from 'lucide-react'

export default function HelpPage() {
  const t = useTranslations('menu')
  const tSupport = useTranslations('support')

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
            <p className="mb-4">
              如果您需要帮助，请通过应用内的客服工单系统联系我们。
              您可以在导航菜单的「更多」中找到「{t('supportTickets')}」，或直接使用下方按钮。
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
                  {t('supportTickets')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
