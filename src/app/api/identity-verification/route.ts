/**
 * GET /api/identity-verification — 获取当前用户实名认证状态
 * POST /api/identity-verification — 提交实名认证（姓名 + 身份证号）
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'

async function getHandler() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('identity_verifications')
    .select('status, real_name, id_number, id_card_front_path, id_card_back_path, rejected_reason, created_at, reviewed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load verification' },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json({ status: null, verification: null })
  }

  return NextResponse.json({
    status: data.status,
    verification: {
      realName: data.real_name,
      idNumberMasked: data.id_number ? `${data.id_number.slice(0, 4)}**********${data.id_number.slice(-4)}` : null,
      idCardFrontPath: data.id_card_front_path ?? undefined,
      idCardBackPath: data.id_card_back_path ?? undefined,
      rejectedReason: data.rejected_reason ?? undefined,
      createdAt: data.created_at,
      reviewedAt: data.reviewed_at ?? undefined,
    },
  })
}

function sanitizeRealName(s: string): string {
  return (s ?? '').trim().slice(0, 50)
}
function sanitizeIdNumber(s: string): string {
  const t = (s ?? '').trim().replace(/\s/g, '')
  if (t.length !== 15 && t.length !== 18) return ''
  return t
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

  let body: { real_name?: string; id_number?: string; id_card_front_path?: string; id_card_back_path?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const realName = sanitizeRealName(body.real_name ?? '')
  const idNumber = sanitizeIdNumber(body.id_number ?? '')
  const idCardFrontPath = (body.id_card_front_path ?? '').trim().slice(0, 500)
  const idCardBackPath = (body.id_card_back_path ?? '').trim().slice(0, 500)

  if (!realName) {
    return NextResponse.json(
      { error: 'real_name is required (1–50 characters)' },
      { status: 400 }
    )
  }
  if (!idNumber) {
    return NextResponse.json(
      { error: 'id_number must be 15 or 18 digits' },
      { status: 400 }
    )
  }
  if (!idCardFrontPath || !idCardBackPath) {
    return NextResponse.json(
      { error: 'id_card_front_path and id_card_back_path (document images) are required' },
      { status: 400 }
    )
  }
  if (!idCardFrontPath.startsWith(user.id) || !idCardBackPath.startsWith(user.id)) {
    return NextResponse.json(
      { error: 'Invalid document path' },
      { status: 400 }
    )
  }

  const { data: existing } = await supabase
    .from('identity_verifications')
    .select('user_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing && existing.status === 'verified') {
    return NextResponse.json(
      { error: 'Already verified' },
      { status: 400 }
    )
  }

  const row = {
    user_id: user.id,
    real_name: realName,
    id_number: idNumber,
    id_card_front_path: idCardFrontPath,
    id_card_back_path: idCardBackPath,
    status: 'pending' as const,
    rejected_reason: null,
    reviewed_by: null,
    reviewed_at: null,
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('identity_verifications')
      .update({
        real_name: row.real_name,
        id_number: row.id_number,
        id_card_front_path: row.id_card_front_path,
        id_card_back_path: row.id_card_back_path,
        status: 'pending',
        rejected_reason: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to submit' },
        { status: 500 }
      )
    }
  } else {
    const { error: insertError } = await supabase
      .from('identity_verifications')
      .insert({
        ...row,
        id_card_front_path: idCardFrontPath,
        id_card_back_path: idCardBackPath,
      })

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || 'Failed to submit' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    success: true,
    status: 'pending',
    message: 'Submitted for review',
  })
}

export const GET = withApiLogging(getHandler, {
  rateLimitConfig: RateLimitConfigs.DEFAULT,
})
export const POST = withApiLogging(postHandler, {
  rateLimitConfig: RateLimitConfigs.DEFAULT,
})
