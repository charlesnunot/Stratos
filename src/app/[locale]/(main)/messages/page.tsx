'use client'

import { ChatList } from '@/components/chat/ChatList'
import { useTranslations } from 'next-intl'

export default function MessagesPage() {
  const t = useTranslations('messages')
  
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>
      <ChatList />
    </div>
  )
}
