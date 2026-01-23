/**
 * Toast utility functions for showing notifications
 * These are convenience wrappers around the toast hook
 */

// We'll use a singleton pattern with the toast function from useToast
let toastInstance: ((props: {
  variant?: 'default' | 'destructive' | 'success' | 'info' | 'warning'
  title?: string
  description?: string
}) => any) | null = null

export function setToastInstance(toast: typeof toastInstance) {
  toastInstance = toast
}

export function showToast(
  message: string,
  variant: 'default' | 'destructive' | 'success' | 'info' | 'warning' = 'default'
) {
  if (!toastInstance) {
    // Fallback to console if toast not initialized (during SSR or before mount)
    if (typeof window !== 'undefined') {
      console.warn('Toast not initialized, message:', message)
    }
    return
  }

  const titles = {
    default: '通知',
    destructive: '错误',
    success: '成功',
    info: '提示',
    warning: '警告',
  }

  return toastInstance({
    variant,
    title: titles[variant],
    description: message,
  })
}

export function showSuccess(message: string) {
  return showToast(message, 'success')
}

export function showError(message: string) {
  return showToast(message, 'destructive')
}

export function showInfo(message: string) {
  return showToast(message, 'info')
}

export function showWarning(message: string) {
  return showToast(message, 'warning')
}
