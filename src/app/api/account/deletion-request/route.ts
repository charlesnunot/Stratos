/**
 * POST /api/account/deletion-request — 提交注销申请（预检查后写入 pending，需管理员审核）
 * GET /api/account/deletion-request — 查询当前用户最新注销申请状态
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'
import { checkDeletionBlocking } from '@/lib/account/check-deletion-blocking'

async function postHandler(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { password?: string; confirm?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password.trim() : ''
  const confirmText = typeof body.confirm === 'string' ? body.confirm.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined

  if (!password) {
    return NextResponse.json(
      { error: 'Password is required to confirm account deletion' },
      { status: 400 }
    )
  }

  if (confirmText.toLowerCase() !== 'delete' && confirmText !== '注销') {
    return NextResponse.json(
      { error: 'Please type "DELETE" or "注销" to confirm' },
      { status: 400 }
    )
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  })

  if (signInError) {
    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 }
    )
  }

  const admin = await getSupabaseAdmin()

  const { data: existing } = await admin
    .from('account_deletion_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have a pending deletion request. Please wait for review.' },
      { status: 409 }
    )
  }

  const { hasBlocking, blockingSummary } = await checkDeletionBlocking(admin, user.id)

  const { error: insertError } = await admin.from('account_deletion_requests').insert({
    user_id: user.id,
    status: 'pending',
    reason: reason || null,
    blocking_summary: blockingSummary,
  })

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message || 'Failed to submit deletion request' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    requiresReview: true,
    blockingSummary,
    message: hasBlocking
      ? 'Deletion request submitted. Admin will review due to pending items.'
      : 'Deletion request submitted. Admin will review.',
  })
}

async function getHandler(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('id, status, blocking_summary, rejected_reason, reviewed_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch deletion request' },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json({ request: null })
  }

  return NextResponse.json({
    request: {
      id: data.id,
      status: data.status,
      blocking_summary: data.blocking_summary,
      rejected_reason: data.rejected_reason,
      reviewed_at: data.reviewed_at,
      created_at: data.created_at,
    },
  })
}

export const POST = withApiLogging(postHandler, {
  rateLimitConfig: RateLimitConfigs.AUTH,
})

export const GET = withApiLogging(getHandler, {
  rateLimitConfig: RateLimitConfigs.DEFAULT,
})
