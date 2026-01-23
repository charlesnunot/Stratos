'use client'

interface EmptyStateProps {
  title?: string
  description?: string
  className?: string
  children?: React.ReactNode
}

export function EmptyState({ title = '暂无内容', description, className, children }: EmptyStateProps) {
  return (
    <div className={className ?? 'py-12 text-center'}>
      <p className="text-sm text-muted-foreground">{title}</p>
      {description ? <p className="mt-2 text-xs text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

