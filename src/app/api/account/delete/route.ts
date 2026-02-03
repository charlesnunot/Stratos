/**
 * POST /api/account/delete — 已废弃：注销改为「申请 → 审核」流程，请使用 POST /api/account/deletion-request
 */

import { NextRequest, NextResponse } from 'next/server'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'

async function postHandler(_request: NextRequest) {
  return NextResponse.json(
    {
      error:
        'Account deletion is now by request and admin review. Please use the deletion request flow in Settings.',
    },
    { status: 410 }
  )
}

export const POST = withApiLogging(postHandler, {
  rateLimitConfig: RateLimitConfigs.AUTH,
})
