/**
 * Unified error handling for payment operations
 * Provides consistent error classification, logging, and user-friendly messages
 */

export enum PaymentErrorType {
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface PaymentError {
  type: PaymentErrorType
  message: string
  userMessage: string
  details?: any
  timestamp: string
}

/**
 * Classify error type
 */
export function classifyError(error: any): PaymentErrorType {
  if (!error) {
    return PaymentErrorType.UNKNOWN_ERROR
  }

  const errorMessage = error.message?.toLowerCase() || ''
  const errorCode = error.code?.toLowerCase() || ''

  // Configuration errors
  if (
    errorMessage.includes('not configured') ||
    errorMessage.includes('missing') ||
    errorMessage.includes('required') ||
    errorCode === 'PGRST116' // Missing required field
  ) {
    return PaymentErrorType.CONFIGURATION_ERROR
  }

  // Validation errors
  if (
    errorMessage.includes('invalid') ||
    errorMessage.includes('mismatch') ||
    errorMessage.includes('not found') ||
    errorCode === '23505' // Unique constraint violation
  ) {
    return PaymentErrorType.VALIDATION_ERROR
  }

  // Network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('fetch failed')
  ) {
    return PaymentErrorType.NETWORK_ERROR
  }

  // Provider errors (Stripe, PayPal, etc.)
  if (
    error.type?.includes('Stripe') ||
    errorMessage.includes('stripe') ||
    errorMessage.includes('paypal') ||
    errorMessage.includes('alipay') ||
    errorMessage.includes('wechat')
  ) {
    return PaymentErrorType.PROVIDER_ERROR
  }

  // Database errors
  if (
    error.code?.startsWith('PGRST') ||
    error.code?.startsWith('235') ||
    errorMessage.includes('database') ||
    errorMessage.includes('sql')
  ) {
    return PaymentErrorType.DATABASE_ERROR
  }

  return PaymentErrorType.UNKNOWN_ERROR
}

/**
 * Create user-friendly error message
 */
export function getUserFriendlyMessage(errorType: PaymentErrorType, error: any): string {
  const errorMessage = error.message || 'Unknown error'

  switch (errorType) {
    case PaymentErrorType.CONFIGURATION_ERROR:
      return '支付服务配置错误，请联系管理员'
    case PaymentErrorType.VALIDATION_ERROR:
      if (errorMessage.includes('amount')) {
        return '支付金额无效'
      }
      if (errorMessage.includes('not found')) {
        return '订单不存在或已被处理'
      }
      return '支付信息验证失败，请检查后重试'
    case PaymentErrorType.NETWORK_ERROR:
      return '网络连接失败，请稍后重试'
    case PaymentErrorType.PROVIDER_ERROR:
      return '支付服务暂时不可用，请稍后重试'
    case PaymentErrorType.DATABASE_ERROR:
      return '数据处理失败，请联系客服'
    case PaymentErrorType.BUSINESS_LOGIC_ERROR:
      return errorMessage.includes('limit') ? '超出支付限额' : '支付处理失败'
    default:
      return '支付处理失败，请稍后重试'
  }
}

/**
 * Sanitize error for logging (remove sensitive information)
 */
export function sanitizeError(error: any): any {
  if (!error) {
    return null
  }

  const sanitized: any = {
    message: error.message,
    type: error.type,
    code: error.code,
  }

  // Remove sensitive fields
  const sensitiveFields = [
    'secret',
    'key',
    'password',
    'token',
    'authorization',
    'api_key',
    'client_secret',
    'private_key',
  ]

  // Recursively sanitize object
  function sanitizeObject(obj: any, depth: number = 0): any {
    if (depth > 5) return '[Max depth reached]' // Prevent infinite recursion
    if (obj === null || obj === undefined) return obj
    if (typeof obj !== 'object') return obj

    const sanitized: any = Array.isArray(obj) ? [] : {}

    for (const key in obj) {
      const lowerKey = key.toLowerCase()
      const isSensitive = sensitiveFields.some((field) => lowerKey.includes(field))

      if (isSensitive) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof obj[key] === 'object') {
        sanitized[key] = sanitizeObject(obj[key], depth + 1)
      } else {
        sanitized[key] = obj[key]
      }
    }

    return sanitized
  }

  return sanitizeObject(error)
}

/**
 * Create structured payment error
 */
export function createPaymentError(
  error: any,
  context?: {
    userId?: string
    orderId?: string
    amount?: number
    paymentMethod?: string
  }
): PaymentError {
  const errorType = classifyError(error)
  const sanitizedError = sanitizeError(error)

  return {
    type: errorType,
    message: error.message || 'Unknown error',
    userMessage: getUserFriendlyMessage(errorType, error),
    details: {
      ...sanitizedError,
      context,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Log payment error with structured format
 */
export function logPaymentError(
  error: PaymentError,
  additionalContext?: Record<string, any>
): void {
  const logEntry = {
    level: 'error',
    category: 'payment',
    errorType: error.type,
    message: error.message,
    userMessage: error.userMessage,
    context: {
      ...error.details?.context,
      ...additionalContext,
    },
    timestamp: error.timestamp,
  }

  // Use structured logging
  console.error('[Payment Error]', JSON.stringify(logEntry, null, 2))

  // In production, send to logging service
  // Example: sendToLoggingService(logEntry)
}
