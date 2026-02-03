'use client'

import { useTranslations } from 'next-intl'

interface EmptyStateProps {
  title?: string
  description?: string
  className?: string
  children?: React.ReactNode
}

export function EmptyState({ title, description, className, children }: EmptyStateProps) {
  const t = useTranslations('common')
  const displayTitle = title ?? t('noContent')
  return (
    <div className={className ?? 'py-12 text-center'}>
      <p className="text-sm text-muted-foreground">{displayTitle}</p>
      {description ? <p className="mt-2 text-xs text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

