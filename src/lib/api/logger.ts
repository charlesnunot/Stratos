/**
 * API Request Logger
 * Logs API requests with timing, user, path, and error information
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
 * Wrapper for API route handlers with logging
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
