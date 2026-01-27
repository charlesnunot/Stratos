'use client'

/**
 * 全局静默处理 AbortError
 * 这些错误通常是由于 React Strict Mode 或组件卸载导致的请求取消，是正常行为
 */
export function setupAbortErrorSuppression() {
  if (typeof window === 'undefined') return

  // 检查是否是 AbortError
  const isAbortError = (error: any): boolean => {
    if (!error) return false
    
    const errorName = error?.name || ''
    const errorMessage = String(error?.message || '')
    const errorString = String(error || '')
    
    // 检查错误名称
    if (errorName === 'AbortError') return true
    
    // 检查错误消息
    const abortKeywords = [
      'aborted',
      'cancelled',
      'signal is aborted',
      'signal is aborted without reason',
      'The operation was aborted',
      'The user aborted a request',
    ]
    
    const lowerMessage = errorMessage.toLowerCase()
    const lowerString = errorString.toLowerCase()
    
    return abortKeywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase()) || 
      lowerString.includes(keyword.toLowerCase())
    )
  }

  // 拦截 console.error 中的 AbortError
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    // 检查所有参数中是否包含 AbortError
    for (const arg of args) {
      if (isAbortError(arg)) {
        // 静默处理，不输出到控制台
        return
      }
      
      // 检查错误对象
      if (arg instanceof Error && isAbortError(arg)) {
        return
      }
      
      // 检查字符串消息
      if (typeof arg === 'string' && isAbortError({ message: arg })) {
        return
      }
    }
    
    // 检查错误消息中是否包含 abort 相关的内容
    const errorString = args.map(arg => {
      if (typeof arg === 'string') return arg
      if (arg instanceof Error) return arg.message
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    }).join(' ')
    
    if (isAbortError({ message: errorString })) {
      // 静默处理
      return
    }
    
    // 其他错误正常输出
    originalConsoleError.apply(console, args)
  }

  // 拦截全局未捕获的错误
  const originalErrorHandler = window.onerror
  window.onerror = (message, source, lineno, colno, error) => {
    if (error && isAbortError(error)) {
      // 静默处理 AbortError
      return true // 阻止默认错误处理
    }
    
    // 检查消息字符串
    if (typeof message === 'string' && isAbortError({ message })) {
      return true
    }
    
    if (originalErrorHandler) {
      return originalErrorHandler(message, source, lineno, colno, error)
    }
    return false
  }

  // 拦截未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason
    if (isAbortError(error)) {
      // 静默处理 AbortError
      event.preventDefault()
      return
    }
  })

  // 返回清理函数
  return () => {
    console.error = originalConsoleError
    window.onerror = originalErrorHandler
  }
}
