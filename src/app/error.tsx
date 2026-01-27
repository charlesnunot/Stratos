'use client'

import { useEffect } from 'react'

// 检查是否是 AbortError（应该被静默处理）
function isAbortError(error: Error): boolean {
  const errorName = (error as any)?.name || ''
  const errorMessage = error.message || ''
  
  return (
    errorName === 'AbortError' ||
    errorMessage.includes('aborted') ||
    errorMessage.includes('cancelled') ||
    errorMessage === 'signal is aborted without reason'
  )
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 如果是 AbortError，静默处理，不显示错误
    if (isAbortError(error)) {
      return
    }
    console.error('Application error:', error)
  }, [error])

  // 如果是 AbortError，不显示错误 UI
  if (isAbortError(error)) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">出现错误</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {error.message || '发生了未知错误'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          重试
        </button>
      </div>
    </div>
  )
}
