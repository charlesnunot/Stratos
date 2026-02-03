'use client'

import { useMemo } from 'react'

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  en: {
    errorOccurred: 'An error occurred. Please try again.',
    errorCritical: 'A critical error occurred',
    globalErrorTitle: 'Critical error',
    retry: 'Retry',
  },
  zh: {
    errorOccurred: '发生错误，请重试',
    errorCritical: '发生了严重错误',
    globalErrorTitle: '全局错误',
    retry: '重试',
  },
}

function isAbortError(error: Error): boolean {
  const errorName = (error as any)?.name || ''
  const errorMessage = error.message || ''
  return (
    errorName === 'AbortError' ||
    errorMessage.includes('aborted') ||
    errorMessage.includes('cancelled') ||
    errorMessage.includes('signal is aborted')
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useMemo(() => {
    if (typeof document === 'undefined') return 'en'
    const lang = document.documentElement?.lang || ''
    return lang.startsWith('zh') ? 'zh' : 'en'
  }, [])

  const t = useMemo(() => ERROR_MESSAGES[locale] || ERROR_MESSAGES.en, [locale])

  if (isAbortError(error)) return null

  const displayMessage =
    process.env.NODE_ENV === 'production'
      ? t.errorOccurred
      : (error.message || t.errorCritical)

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
          <div className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-2xl font-bold">{t.globalErrorTitle}</h1>
            <p className="text-muted-foreground">{displayMessage}</p>
            <button
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              {t.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
