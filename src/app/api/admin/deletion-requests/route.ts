/**
 * GET /api/admin/deletion-requests — 分页列表，仅 pending
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authResult = await requireAdminOrSupport(request)
  if (!authResult.success) return authResult.response

  const admin = await getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  let query = admin
    .from('account_deletion_requests')
    .select('id, user_id, status, reason, blocking_summary, rejected_reason, reviewed_by, reviewed_at, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data: requests, error, count } = await query

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch deletion requests' },
      { status: 500 }
    )
  }

  const userIds = [...new Set((requests ?? []).map((r) => r.user_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, display_name, role, subscription_type')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  const items = (requests ?? []).map((r) => ({
    ...r,
    profile: profileMap.get(r.user_id) ?? null,
  }))

  return NextResponse.json({
    requests: items,
    total: count ?? 0,
  })
}
