'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

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

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('common')

  useEffect(() => {
    if (isAbortError(error)) return
    console.error('Main app error:', error)
  }, [error])

  if (isAbortError(error)) return null

  const displayMessage =
    process.env.NODE_ENV === 'production'
      ? t('errorOccurred')
      : (error.message || t('errorUnknown'))

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">{t('errorTitle')}</h1>
        <p className="text-gray-600 dark:text-gray-400">{displayMessage}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {t('retry')}
        </button>
      </div>
    </div>
  )
}
