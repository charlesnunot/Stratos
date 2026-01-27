/**
 * Unified API error handling
 * Provides consistent error classification, logging, and user-friendly messages
 */

import { NextResponse } from 'next/server'

export enum ApiErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ApiError {
  type: ApiErrorType
  message: string
  userMessage: string
  statusCode: number
  details?: Record<string, unknown>
  timestamp: string
  requestId?: string
}

/**
 * Classify error type based on error object
 */
export function classifyApiError(error: unknown): ApiErrorType {
  if (!error) {
    return ApiErrorType.UNKNOWN_ERROR
  }

  const err = error as { message?: string; code?: string; status?: number; type?: string }
  const errorMessage = (err.message || '').toLowerCase()
  const errorCode = (err.code || '').toLowerCase()

  // Validation errors
  if (
    errorMessage.includes('invalid') ||
    errorMessage.includes('missing') ||
    errorMessage.includes('required') ||
    errorMessage.includes('validation') ||
    errorCode === 'PGRST116' ||
    err.status === 400
  ) {
    return ApiErrorType.VALIDATION_ERROR
  }

  // Authentication errors
  if (
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('session') ||
    errorMessage.includes('token') ||
    err.status === 401
  ) {
    return ApiErrorType.AUTHENTICATION_ERROR
  }

  // Authorization errors
  if (
    errorMessage.includes('forbidden') ||
    errorMessage.includes('permission') ||
    errorMessage.includes('access denied') ||
    err.status === 403
  ) {
    return ApiErrorType.AUTHORIZATION_ERROR
  }

  // Not found errors
  if (
    errorMessage.includes('not found') ||
    errorMessage.includes('does not exist') ||
    errorCode === 'PGRST116' ||
    err.status === 404
  ) {
    return ApiErrorType.NOT_FOUND_ERROR
  }

  // Conflict errors
  if (
    errorMessage.includes('already exists') ||
    errorMessage.includes('duplicate') ||
    errorCode === '23505' || // Unique constraint violation
    err.status === 409
  ) {
    return ApiErrorType.CONFLICT_ERROR
  }

  // Rate limit errors
  if (
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    err.status === 429
  ) {
    return ApiErrorType.RATE_LIMIT_ERROR
  }

  // Database errors
  if (
    errorCode?.startsWith('PGRST') ||
    errorCode?.startsWith('235') ||
    errorMessage.includes('database') ||
    errorMessage.includes('sql') ||
    errorMessage.includes('connection')
  ) {
    return ApiErrorType.DATABASE_ERROR
  }

  // External service errors (Stripe, PayPal, etc.)
  if (
    err.type?.includes('Stripe') ||
    errorMessage.includes('stripe') ||
    errorMessage.includes('paypal') ||
    errorMessage.includes('alipay') ||
    errorMessage.includes('wechat') ||
    errorMessage.includes('external') ||
    (err.status && err.status >= 502 && err.status < 504)
  ) {
    return ApiErrorType.EXTERNAL_SERVICE_ERROR
  }

  return ApiErrorType.INTERNAL_SERVER_ERROR
}

/**
 * Get HTTP status code for error type
 */
export function getStatusCodeForErrorType(errorType: ApiErrorType): number {
  const statusMap: Record<ApiErrorType, number> = {
    [ApiErrorType.VALIDATION_ERROR]: 400,
    [ApiErrorType.AUTHENTICATION_ERROR]: 401,
    [ApiErrorType.AUTHORIZATION_ERROR]: 403,
    [ApiErrorType.NOT_FOUND_ERROR]: 404,
    [ApiErrorType.CONFLICT_ERROR]: 409,
    [ApiErrorType.RATE_LIMIT_ERROR]: 429,
    [ApiErrorType.DATABASE_ERROR]: 500,
    [ApiErrorType.EXTERNAL_SERVICE_ERROR]: 502,
    [ApiErrorType.INTERNAL_SERVER_ERROR]: 500,
    [ApiErrorType.UNKNOWN_ERROR]: 500,
  }
  return statusMap[errorType]
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(errorType: ApiErrorType, error: unknown): string {
  const err = error as { message?: string }
  const errorMessage = err.message || ''

  switch (errorType) {
    case ApiErrorType.VALIDATION_ERROR:
      if (errorMessage.includes('missing') || errorMessage.includes('required')) {
        return '请提供所有必需的信息'
      }
      if (errorMessage.includes('invalid')) {
        return '输入信息无效，请检查后重试'
      }
      return '请求参数验证失败'
    case ApiErrorType.AUTHENTICATION_ERROR:
      return '请先登录'
    case ApiErrorType.AUTHORIZATION_ERROR:
      return '您没有权限执行此操作'
    case ApiErrorType.NOT_FOUND_ERROR:
      return '请求的资源不存在'
    case ApiErrorType.CONFLICT_ERROR:
      return '资源已存在或发生冲突'
    case ApiErrorType.RATE_LIMIT_ERROR:
      return '请求过于频繁，请稍后再试'
    case ApiErrorType.DATABASE_ERROR:
      return '数据处理失败，请稍后重试'
    case ApiErrorType.EXTERNAL_SERVICE_ERROR:
      return '外部服务暂时不可用，请稍后重试'
    case ApiErrorType.INTERNAL_SERVER_ERROR:
      return '服务器内部错误，请稍后重试'
    default:
      return '发生未知错误，请稍后重试'
  }
}

/**
 * Sanitize error for logging (remove sensitive information)
 */
export function sanitizeErrorForLogging(error: unknown): Record<string, unknown> {
  if (!error) {
    return {}
  }

  const err = error as Record<string, unknown>
  const sanitized: Record<string, unknown> = {
    message: err.message,
    type: err.type,
    code: err.code,
    name: err.name,
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
    'access_token',
    'refresh_token',
  ]

  function sanitizeObject(obj: unknown, depth = 0): unknown {
    if (depth > 5) return '[Max depth reached]'
    if (obj === null || obj === undefined) return obj
    if (typeof obj !== 'object') return obj

    const sanitized: Record<string, unknown> = Array.isArray(obj) ? [] : {}

    for (const key in obj as Record<string, unknown>) {
      const lowerKey = key.toLowerCase()
      const isSensitive = sensitiveFields.some((field) => lowerKey.includes(field))

      if (isSensitive) {
        sanitized[key] = '[REDACTED]'
      } else {
        const value = (obj as Record<string, unknown>)[key]
        if (typeof value === 'object') {
          sanitized[key] = sanitizeObject(value, depth + 1)
        } else {
          sanitized[key] = value
        }
      }
    }

    return sanitized
  }

  return sanitizeObject(err) as Record<string, unknown>
}

/**
 * Create structured API error
 */
export function createApiError(
  error: unknown,
  context?: {
    userId?: string
    path?: string
    method?: string
    requestId?: string
  }
): ApiError {
  const errorType = classifyApiError(error)
  const sanitizedError = sanitizeErrorForLogging(error)
  const err = error as { message?: string }

  return {
    type: errorType,
    message: err.message || 'Unknown error',
    userMessage: getUserFriendlyMessage(errorType, error),
    statusCode: getStatusCodeForErrorType(errorType),
    details: {
      ...sanitizedError,
      context,
    },
    timestamp: new Date().toISOString(),
    requestId: context?.requestId,
  }
}

/**
 * Log API error with structured format
 */
export function logApiError(
  error: ApiError,
  additionalContext?: Record<string, unknown>
): void {
  const logEntry = {
    level: 'error',
    category: 'api',
    errorType: error.type,
    message: error.message,
    userMessage: error.userMessage,
    statusCode: error.statusCode,
    context: {
      ...error.details?.context,
      ...additionalContext,
    },
    timestamp: error.timestamp,
    requestId: error.requestId,
  }

  // Use structured logging
  console.error('[API Error]', JSON.stringify(logEntry, null, 2))

  // In production, send to logging service
  // Example: sendToLoggingService(logEntry)
}

/**
 * Handle API error and return NextResponse
 */
export function handleApiError(
  error: unknown,
  context?: {
    userId?: string
    path?: string
    method?: string
    requestId?: string
  }
): NextResponse {
  const apiError = createApiError(error, context)
  logApiError(apiError)

  return NextResponse.json(
    {
      error: apiError.userMessage,
      type: apiError.type,
      requestId: apiError.requestId,
      // Only include details in development
      ...(process.env.NODE_ENV === 'development' && {
        details: apiError.details,
      }),
    },
    { status: apiError.statusCode }
  )
}
