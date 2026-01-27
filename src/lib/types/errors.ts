export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN',
}

export interface AppError {
  type: ErrorType
  message: string
  code?: string
  retryable?: boolean
}

export function parseError(error: unknown): AppError {
  // Handle Supabase error objects (not Error instances but have message/code/details)
  const err = error as { message?: string; code?: string; details?: string; hint?: string }
  const errorMessage = err?.message || err?.details || err?.hint || ''
  const errorCode = err?.code || ''
  
  // If it's an Error instance, use its message
  if (error instanceof Error) {
    const message = error.message || errorMessage
    // 网络错误
    if (message.includes('fetch') || message.includes('network') || message.includes('NetworkError')) {
      return { type: ErrorType.NETWORK, message, code: errorCode, retryable: true }
    }
    // 认证错误
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('session') || errorCode.includes('401')) {
      return { type: ErrorType.AUTHENTICATION, message, code: errorCode, retryable: false }
    }
    // 授权错误
    if (message.includes('forbidden') || message.includes('permission') || errorCode.includes('403') || errorCode.includes('42501')) {
      return { type: ErrorType.AUTHORIZATION, message, code: errorCode, retryable: false }
    }
    // 验证错误
    if (message.includes('validation') || message.includes('invalid') || errorCode.includes('400') || errorCode.includes('PGRST116')) {
      return { type: ErrorType.VALIDATION, message, code: errorCode, retryable: false }
    }
    // 未找到错误
    if (message.includes('not found') || message.includes('404') || errorCode.includes('404') || errorCode.includes('PGRST116')) {
      return { type: ErrorType.NOT_FOUND, message, code: errorCode, retryable: false }
    }
    // 服务器错误
    if (message.includes('500') || message.includes('server') || errorCode.includes('500')) {
      return { type: ErrorType.SERVER, message, code: errorCode, retryable: true }
    }
    // Default for Error instances
    return { type: ErrorType.UNKNOWN, message, code: errorCode, retryable: false }
  }
  
  // Handle non-Error objects (like Supabase error objects)
  if (errorMessage) {
    // 网络错误
    if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('NetworkError')) {
      return { type: ErrorType.NETWORK, message: errorMessage, code: errorCode, retryable: true }
    }
    // 认证错误
    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized') || errorMessage.includes('session') || errorCode.includes('401')) {
      return { type: ErrorType.AUTHENTICATION, message: errorMessage, code: errorCode, retryable: false }
    }
    // 授权错误
    if (errorMessage.includes('forbidden') || errorMessage.includes('permission') || errorCode.includes('403') || errorCode.includes('42501')) {
      return { type: ErrorType.AUTHORIZATION, message: errorMessage, code: errorCode, retryable: false }
    }
    // 验证错误
    if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorCode.includes('400') || errorCode.includes('PGRST116')) {
      return { type: ErrorType.VALIDATION, message: errorMessage, code: errorCode, retryable: false }
    }
    // 未找到错误
    if (errorMessage.includes('not found') || errorMessage.includes('404') || errorCode.includes('404')) {
      return { type: ErrorType.NOT_FOUND, message: errorMessage, code: errorCode, retryable: false }
    }
    // 服务器错误
    if (errorMessage.includes('500') || errorMessage.includes('server') || errorCode.includes('500')) {
      return { type: ErrorType.SERVER, message: errorMessage, code: errorCode, retryable: true }
    }
    // Return with the actual message
    return { type: ErrorType.UNKNOWN, message: errorMessage, code: errorCode, retryable: false }
  }
  
  // Fallback for truly unknown errors
  return { 
    type: ErrorType.UNKNOWN, 
    message: '发生未知错误，请重试',
    code: errorCode,
    retryable: false 
  }
}
