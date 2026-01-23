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
  if (error instanceof Error) {
    // 网络错误
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('NetworkError')) {
      return { type: ErrorType.NETWORK, message: error.message, retryable: true }
    }
    // 认证错误
    if (error.message.includes('auth') || error.message.includes('unauthorized') || error.message.includes('session')) {
      return { type: ErrorType.AUTHENTICATION, message: error.message, retryable: false }
    }
    // 授权错误
    if (error.message.includes('forbidden') || error.message.includes('permission')) {
      return { type: ErrorType.AUTHORIZATION, message: error.message, retryable: false }
    }
    // 验证错误
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return { type: ErrorType.VALIDATION, message: error.message, retryable: false }
    }
    // 未找到错误
    if (error.message.includes('not found') || error.message.includes('404')) {
      return { type: ErrorType.NOT_FOUND, message: error.message, retryable: false }
    }
    // 服务器错误
    if (error.message.includes('500') || error.message.includes('server')) {
      return { type: ErrorType.SERVER, message: error.message, retryable: true }
    }
  }
  return { 
    type: ErrorType.UNKNOWN, 
    message: 'An unknown error occurred',
    retryable: false 
  }
}
