'use client'

import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  message?: string
  className?: string
}

export function LoadingState({ message, className }: LoadingStateProps) {
  return (
    <div className={className ?? 'flex items-center justify-center py-12'}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {message ? <span className="text-sm">{message}</span> : null}
      </div>
    </div>
  )
}

