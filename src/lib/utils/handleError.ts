'use client'

import { parseError } from '@/lib/types/errors'
import { ErrorType } from '@/lib/types/errors'
import { showError, showWarning } from '@/lib/utils/toast'

/**
 * Centralized error handler for UI actions.
 * - Logs the raw error for debugging
 * - Shows a user-friendly toast message
 */
export function handleError(error: unknown, fallbackMessage: string = '操作失败，请重试') {
  const parsed = parseError(error)
  // Always log raw error (keeps stack/message)
  console.error('App error:', error)

  // Prefer parsed message, fall back to provided one
  const message = parsed?.message || fallbackMessage

  // Auth/authz errors are usually actionable
  if (parsed?.type === ErrorType.AUTHENTICATION || parsed?.type === ErrorType.AUTHORIZATION) {
    showWarning(message)
    return
  }

  showError(message)
}

