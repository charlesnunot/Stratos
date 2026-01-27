'use client'

import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { parseError } from '@/lib/types/errors'
import { useTranslations } from 'next-intl'

interface RetryableErrorProps {
  error: unknown
  onRetry?: () => void
  title?: string
}

export function RetryableError({ error, onRetry, title }: RetryableErrorProps) {
  const appError = parseError(error)
  const t = useTranslations('common')
  
  return (
    <div className="py-12 text-center">
      <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
      {title && <h2 className="mb-2 text-lg font-semibold">{title}</h2>}
      <p className="mb-4 text-destructive">{appError.message}</p>
      {appError.retryable && onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('retry')}
        </Button>
      )}
    </div>
  )
}
