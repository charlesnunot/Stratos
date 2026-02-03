'use client'

import { Link } from '@/i18n/navigation'
import { useLocale } from 'next-intl'
import { Hash } from 'lucide-react'

interface TopicTagProps {
  topic: {
    id: string
    name: string
    slug: string
    name_translated?: string | null
    name_lang?: 'zh' | 'en' | null
  }
}

/** 按当前 locale 显示话题名：与 name_lang 一致用 name，否则用 name_translated ?? name */
function getDisplayTopicName(
  topic: TopicTagProps['topic'],
  locale: string
): string {
  const lang = topic.name_lang ?? 'zh'
  return locale === lang ? topic.name : (topic.name_translated ?? topic.name)
}

export function TopicTag({ topic }: TopicTagProps) {
  const locale = useLocale()
  const displayName = getDisplayTopicName(topic, locale)
  return (
    <Link
      href={`/topics/${topic.slug}`}
      className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80"
    >
      <Hash className="h-3 w-3" />
      {displayName}
    </Link>
  )
}
