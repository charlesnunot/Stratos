'use client'

import { useEffect } from 'react'
import { setupAbortErrorSuppression } from '@/lib/utils/suppress-abort-errors'

/**
 * 全局错误抑制组件
 * 静默处理 AbortError，这些错误通常是由于 React Strict Mode 或组件卸载导致的请求取消
 */
export function ErrorSuppressor() {
  useEffect(() => {
    const cleanup = setupAbortErrorSuppression()
    return cleanup
  }, [])

  return null
}
