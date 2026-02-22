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

// 默认标题（中文）
const defaultTitles = {
  default: '通知',
  destructive: '错误',
  success: '成功',
  info: '提示',
  warning: '警告',
}

export function setToastInstance(toast: typeof toastInstance) {
  toastInstance = toast
}

export function showToast(
  message: string,
  variant: 'default' | 'destructive' | 'success' | 'info' | 'warning' = 'default',
  title?: string
) {
  if (!toastInstance) {
    // Fallback to console if toast not initialized (during SSR or before mount)
    if (typeof window !== 'undefined') {
      console.warn('Toast not initialized, message:', message)
    }
    return
  }

  return toastInstance({
    variant,
    title: title || defaultTitles[variant],
    description: message,
  })
}

export function showSuccess(message: string, title?: string) {
  return showToast(message, 'success', title)
}

export function showError(message: string, title?: string) {
  return showToast(message, 'destructive', title)
}

export function showInfo(message: string, title?: string) {
  return showToast(message, 'info', title)
}

export function showWarning(message: string, title?: string) {
  return showToast(message, 'warning', title)
}
