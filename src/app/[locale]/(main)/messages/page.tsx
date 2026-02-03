'use client'

import { useEffect } from 'react'
import { ChatList } from '@/components/chat/ChatList'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

export default function MessagesPage() {
  const t = useTranslations('messages')
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>
      <ChatList />
    </div>
  )
}
