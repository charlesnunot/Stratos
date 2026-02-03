/**
 * API Rate Limiting
 * Uses in-memory storage (suitable for serverless)
 * For production, consider using Redis or Supabase for distributed rate limiting
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store (per-instance, resets on server restart)
// For production, use Redis or Supabase
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * Default rate limit configurations
 */
export const RateLimitConfigs = {
  // General API endpoints
  DEFAULT: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  
  // Authentication endpoints
  AUTH: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 requests per minute
  
  // Payment endpoints (more restrictive)
  PAYMENT: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 requests per minute
  
  // Order creation (prevent spam)
  ORDER_CREATE: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 requests per minute
  
  // Admin endpoints (more permissive)
  ADMIN: { maxRequests: 200, windowMs: 60 * 1000 }, // 200 requests per minute
  
  // Webhook endpoints (very permissive, signature verification is the main protection)
  WEBHOOK: { maxRequests: 1000, windowMs: 60 * 1000 }, // 1000 requests per minute

  // Track/view (浏览埋点，防刷量)
  TRACK_VIEW: { maxRequests: 120, windowMs: 60 * 1000 }, // 120 requests per minute per IP/user

  // Messages (防消息刷屏)
  MESSAGES: { maxRequests: 30, windowMs: 60 * 1000 }, // 30 messages per minute per user

  // Order cancel (防刷取消)
  ORDER_CANCEL: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 cancels per minute per user
} as const

/**
 * Check rate limit for a given identifier
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RateLimitConfigs.DEFAULT
): Promise<RateLimitResult> {
  const now = Date.now()
  const key = `${identifier}:${Math.floor(now / config.windowMs)}`
  
  const entry = rateLimitStore.get(key)
  
  if (!entry || entry.resetAt < now) {
    // Create new entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    }
    rateLimitStore.set(key, newEntry)
    
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: newEntry.resetAt,
    }
  }
  
  if (entry.count >= config.maxRequests) {
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      reset: entry.resetAt,
    }
  }
  
  // Increment count
  entry.count++
  rateLimitStore.set(key, entry)
  
  return {
    success: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - entry.count,
    reset: entry.resetAt,
  }
}

/**
 * Get rate limit identifier from request
 * Uses IP address or user ID, whichever is available
 */
export function getRateLimitIdentifier(
  request: Request,
  userId?: string
): string {
  // Prefer user ID if available (more accurate)
  if (userId) {
    return `user:${userId}`
  }
  
  // Fallback to IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             'unknown'
  
  return `ip:${ip}`
}

/**
 * Rate limit middleware wrapper
 */
export async function withRateLimit<T>(
  request: Request,
  handler: () => Promise<T>,
  config: RateLimitConfig = RateLimitConfigs.DEFAULT,
  userId?: string
): Promise<T | Response> {
  const identifier = getRateLimitIdentifier(request, userId)
  const result = await checkRateLimit(identifier, config)
  
  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: '请求过于频繁，请稍后再试',
        type: 'RATE_LIMIT_ERROR',
        limit: result.limit,
        reset: new Date(result.reset).toISOString(),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.reset.toString(),
          'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
        },
      }
    )
  }
  
  return handler()
}
