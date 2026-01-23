'use client'

import { Link } from '@/i18n/navigation'
import { Hash } from 'lucide-react'

interface TopicTagProps {
  topic: {
    id: string
    name: string
    slug: string
  }
}

export function TopicTag({ topic }: TopicTagProps) {
  return (
    <Link
      href={`/topics/${topic.slug}`}
      className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80"
    >
      <Hash className="h-3 w-3" />
      {topic.name}
    </Link>
  )
}
