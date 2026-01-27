/**
 * Example API route demonstrating unified error handling, rate limiting, and logging
 * This serves as a reference for other API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { withApiLogging } from '@/lib/api/logger'
import { handleApiError } from '@/lib/api/error-handler'
import { RateLimitConfigs } from '@/lib/api/rate-limit'

// Example: GET endpoint with rate limiting and logging
export const GET = withApiLogging(
  async (request: NextRequest) => {
    // Your handler logic here
    // Errors will be automatically logged and handled
    
    return NextResponse.json({
      message: 'Success',
      data: { example: 'data' },
    })
  },
  {
    rateLimitConfig: RateLimitConfigs.DEFAULT,
  }
)

// Example: POST endpoint with custom rate limit
export const POST = withApiLogging(
  async (request: NextRequest) => {
    const body = await request.json()
    
    // Validate input
    if (!body.example) {
      throw new Error('Missing required field: example')
    }
    
    // Your handler logic here
    
    return NextResponse.json({
      message: 'Success',
      data: body,
    })
  },
  {
    rateLimitConfig: RateLimitConfigs.ORDER_CREATE, // More restrictive for order creation
  }
)
