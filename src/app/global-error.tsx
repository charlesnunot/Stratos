'use client'

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

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // 如果是 AbortError，静默处理，不显示错误 UI
  if (isAbortError(error)) {
    return null
  }
  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
          <div className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-2xl font-bold">全局错误</h1>
            <p className="text-muted-foreground">
              {error.message || '发生了严重错误'}
            </p>
            <button
              onClick={reset}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              重试
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
