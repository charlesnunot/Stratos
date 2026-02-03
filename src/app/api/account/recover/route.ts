/**
 * GET  /api/account/recover — 当前用户是否可自助恢复（status=deleted 且未过冷静期）
 * POST /api/account/recover — 自助恢复账户（30 天内）
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'
import { logAudit } from '@/lib/api/audit'

const RECOVERY_GRACE_DAYS = 30

async function getHandler(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await getSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (profile.status !== 'deleted') {
    return NextResponse.json({
      status: profile.status,
      canRecover: false,
      message: 'Account is not deleted.',
    })
  }

  const { data: approvedRequest } = await admin
    .from('account_deletion_requests')
    .select('reviewed_at')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const reviewedAt = approvedRequest?.reviewed_at
    ? new Date(approvedRequest.reviewed_at)
    : null
  const graceEnd = reviewedAt
    ? new Date(reviewedAt.getTime() + RECOVERY_GRACE_DAYS * 24 * 60 * 60 * 1000)
    : null
  const now = new Date()
  const canRecover = !!graceEnd && now < graceEnd

  return NextResponse.json({
    status: 'deleted',
    canRecover,
    reviewedAt: reviewedAt?.toISOString() ?? null,
    graceEndAt: graceEnd?.toISOString() ?? null,
    message: canRecover
      ? null
      : 'Recovery grace period has ended. Please contact support.',
  })
}

async function postHandler(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await getSupabaseAdmin()

  const { data: profile } = await admin
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status !== 'deleted') {
    return NextResponse.json(
      { error: 'Account is not deleted or cannot be recovered.' },
      { status: 400 }
    )
  }

  const { data: approvedRequest } = await admin
    .from('account_deletion_requests')
    .select('reviewed_at')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const reviewedAt = approvedRequest?.reviewed_at
    ? new Date(approvedRequest.reviewed_at)
    : null
  const graceEnd = reviewedAt
    ? new Date(reviewedAt.getTime() + RECOVERY_GRACE_DAYS * 24 * 60 * 60 * 1000)
    : null
  const now = new Date()

  if (!graceEnd || now >= graceEnd) {
    return NextResponse.json(
      {
        error:
          'Recovery grace period has ended. Please contact support to restore your account.',
      },
      { status: 403 }
    )
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Failed to recover account' },
      { status: 500 }
    )
  }

  logAudit({
    action: 'account_recovered',
    userId: user.id,
    resourceId: user.id,
    resourceType: 'profile',
    result: 'success',
    timestamp: new Date().toISOString(),
    meta: { self_service: true },
  })

  return NextResponse.json({
    success: true,
    message: 'Account has been recovered. You can use the app again.',
  })
}

export const GET = withApiLogging(getHandler, {
  rateLimitConfig: RateLimitConfigs.DEFAULT,
})

export const POST = withApiLogging(postHandler, {
  rateLimitConfig: RateLimitConfigs.AUTH,
})
