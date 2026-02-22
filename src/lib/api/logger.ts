/**
 * API Request Logger
 * Logs API requests with timing, user, path, and error information
 * 
 * 认证日志规范：
 * - 记录认证动作类型 (login, logout, register, reset-password, verify-email)
 * - 记录用户ID和状态 (success, failed)
 * - 绝不记录密码或其他敏感凭证
 */

import { NextRequest } from 'next/server'

export interface ApiLogEntry {
  method: string
  path: string
  userId?: string
  statusCode?: number
  duration?: number
  error?: {
    type: string
    message: string
  }
  timestamp: string
  userAgent?: string
  ip?: string
  requestId?: string
}

/**
 * 认证动作日志条目
 * 用于追踪认证相关操作
 */
export interface AuthActionLogEntry {
  action: 'login' | 'logout' | 'register' | 'reset-password' | 'verify-email' | 'refresh-token'
  userId?: string
  status: 'success' | 'failed' | 'pending'
  error?: string
  timestamp: string
  metadata?: Record<string, unknown>
}

// In-memory auth log buffer (for development)
const authLogBuffer: AuthActionLogEntry[] = []
const MAX_AUTH_LOG_BUFFER_SIZE = 500

// In-memory log buffer (for development)
// In production, send to logging service or database
const logBuffer: ApiLogEntry[] = []
const MAX_BUFFER_SIZE = 1000

/**
 * Generate request ID
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`
}

/**
 * Get client IP from request
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             'unknown'
  return ip
}

/**
 * Log API request
 */
export function logApiRequest(entry: ApiLogEntry): void {
  // Add to buffer
  logBuffer.push(entry)
  
  // Keep buffer size manageable
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift()
  }
  
  // Structured logging
  const logLevel = entry.error ? 'error' : entry.statusCode && entry.statusCode >= 400 ? 'warn' : 'info'
  
  console.log(`[API ${logLevel.toUpperCase()}]`, JSON.stringify({
    ...entry,
    level: logLevel,
  }))
  
  // In production, send to logging service
  // Example: sendToLoggingService(entry)
}

/**
 * Create API log entry
 */
export function createApiLogEntry(
  request: NextRequest,
  options: {
    userId?: string
    statusCode?: number
    duration?: number
    error?: { type: string; message: string }
    requestId?: string
  }
): ApiLogEntry {
  const url = new URL(request.url)
  
  return {
    method: request.method,
    path: url.pathname,
    userId: options.userId,
    statusCode: options.statusCode,
    duration: options.duration,
    error: options.error,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent') || undefined,
    ip: getClientIp(request),
    requestId: options.requestId || generateRequestId(),
  }
}

/**
 * Get API logs (for monitoring/dashboard)
 */
export function getApiLogs(limit = 100): ApiLogEntry[] {
  return logBuffer.slice(-limit).reverse()
}

/**
 * Get API statistics
 */
export function getApiStatistics(): {
  totalRequests: number
  errorRate: number
  averageDuration: number
  requestsByStatus: Record<number, number>
} {
  const totalRequests = logBuffer.length
  const errors = logBuffer.filter(log => log.error || (log.statusCode && log.statusCode >= 400))
  const errorRate = totalRequests > 0 ? errors.length / totalRequests : 0
  
  const durations = logBuffer
    .filter(log => log.duration !== undefined)
    .map(log => log.duration!)
  const averageDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0
  
  const requestsByStatus: Record<number, number> = {}
  logBuffer.forEach(log => {
    if (log.statusCode) {
      requestsByStatus[log.statusCode] = (requestsByStatus[log.statusCode] || 0) + 1
    }
  })
  
  return {
    totalRequests,
    errorRate,
    averageDuration,
    requestsByStatus,
  }
}

/**
 * 记录认证动作
 * 用于追踪登录、登出、注册等认证操作
 * 
 * 重要：此函数绝不记录密码或其他敏感凭证
 * 
 * @param entry - 认证动作信息（不含密码）
 */
export function logAuthAction(entry: Omit<AuthActionLogEntry, 'timestamp'>): void {
  const logEntry: AuthActionLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  }
  
  // Add to buffer
  authLogBuffer.push(logEntry)
  
  // Keep buffer size manageable
  if (authLogBuffer.length > MAX_AUTH_LOG_BUFFER_SIZE) {
    authLogBuffer.shift()
  }
  
  // Structured logging
  const logLevel = entry.status === 'failed' ? 'warn' : 'info'
  
  // 构建安全的日志对象（确保不包含敏感信息）
  const safeLogData = {
    action: logEntry.action,
    userId: logEntry.userId ? `${logEntry.userId.substring(0, 8)}...` : undefined, // 截断 userId
    status: logEntry.status,
    error: logEntry.error,
    timestamp: logEntry.timestamp,
    level: logLevel,
  }
  
  console.log(`[AUTH ${logLevel.toUpperCase()}]`, JSON.stringify(safeLogData))
}

/**
 * 获取认证日志
 */
export function getAuthLogs(limit = 100): AuthActionLogEntry[] {
  return authLogBuffer.slice(-limit).reverse()
}

/**
 * 获取认证统计
 */
export function getAuthStatistics(): {
  totalActions: number
  successRate: number
  actionsByType: Record<string, number>
  failedActions: number
} {
  const totalActions = authLogBuffer.length
  const successActions = authLogBuffer.filter(log => log.status === 'success')
  const failedActions = authLogBuffer.filter(log => log.status === 'failed')
  const successRate = totalActions > 0 ? successActions.length / totalActions : 0
  
  const actionsByType: Record<string, number> = {}
  authLogBuffer.forEach(log => {
    actionsByType[log.action] = (actionsByType[log.action] || 0) + 1
  })
  
  return {
    totalActions,
    successRate,
    actionsByType,
    failedActions: failedActions.length,
  }
}

/**
 * Wrapper for API route handlers with logging
 * 
 * 重要：当 options.requireAuth = true 时，如果用户未登录会返回 401
 * 这是强制鉴权，不只是日志记录
 */
export function withApiLogging<T>(
  handler: (request: NextRequest, context?: any) => Promise<T>,
  options?: {
    rateLimitConfig?: import('./rate-limit').RateLimitConfig
    requireAuth?: boolean
  }
) {
  return async (request: NextRequest, context?: any): Promise<T | Response> => {
    const startTime = Date.now()
    const requestId = generateRequestId()
    let userId: string | undefined
    let statusCode = 200
    let error: { type: string; message: string } | undefined
    
    try {
      // Get user ID if available
      try {
        const { createClient } = await import('@/lib/supabase/server')
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        userId = user?.id
      } catch {
        // Ignore auth errors, continue without user ID
      }
      
      // 🚨 强制鉴权检查
      if (options?.requireAuth && !userId) {
        statusCode = 401
        error = {
          type: 'AUTH_REQUIRED',
          message: 'Authentication required',
        }
        
        const logEntry = createApiLogEntry(request, {
          statusCode,
          duration: Date.now() - startTime,
          error,
          requestId,
        })
        logApiRequest(logEntry)
        
        return new Response(
          JSON.stringify({
            error: 'Unauthorized',
            message: 'Please login to access this resource',
            type: 'AUTH_REQUIRED',
            requestId,
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        ) as T
      }
      
      // Apply rate limiting if configured
      if (options?.rateLimitConfig) {
        const { checkRateLimit, getRateLimitIdentifier } = await import('./rate-limit')
        const identifier = getRateLimitIdentifier(request, userId)
        const rateLimitResult = await checkRateLimit(identifier, options.rateLimitConfig)
        
        if (!rateLimitResult.success) {
          statusCode = 429
          error = {
            type: 'RATE_LIMIT_ERROR',
            message: 'Rate limit exceeded',
          }
          
          const logEntry = createApiLogEntry(request, {
            userId,
            statusCode,
            duration: Date.now() - startTime,
            error,
            requestId,
          })
          logApiRequest(logEntry)
          
          return new Response(
            JSON.stringify({
              error: '请求过于频繁，请稍后再试',
              type: 'RATE_LIMIT_ERROR',
              requestId,
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                'X-RateLimit-Reset': rateLimitResult.reset.toString(),
                'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
              },
            }
          ) as T
        }
      }
      
      // Execute handler
      const result = await handler(request, context)
      
      // Extract status code from NextResponse if applicable
      if (result && typeof result === 'object' && 'status' in result) {
        statusCode = (result as { status: number }).status
      }
      
      const duration = Date.now() - startTime
      
      // Log successful request
      const logEntry = createApiLogEntry(request, {
        userId,
        statusCode,
        duration,
        requestId,
      })
      logApiRequest(logEntry)
      
      return result
    } catch (err) {
      const duration = Date.now() - startTime
      statusCode = 500
      
      const apiError = err as { type?: string; message?: string }
      error = {
        type: apiError.type || 'UNKNOWN_ERROR',
        message: apiError.message || 'Unknown error',
      }
      
      // Log error
      const logEntry = createApiLogEntry(request, {
        userId,
        statusCode,
        duration,
        error,
        requestId,
      })
      logApiRequest(logEntry)
      
      // Re-throw to be handled by error handler
      throw err
    }
  }
}
