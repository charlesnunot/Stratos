/**
 * POST /api/admin/deletion-requests/[id]/reject — 拒绝注销申请
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminOrSupport(request)
  if (!authResult.success) return authResult.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing request id' }, { status: 400 })
  }

  let body: { rejected_reason?: string }
  try {
    body = await request.json().catch(() => ({}))
  } catch {
    body = {}
  }
  const rejectedReason =
    typeof body.rejected_reason === 'string' ? body.rejected_reason.trim() : ''

  const admin = await getSupabaseAdmin()

  const { data: row, error: fetchError } = await admin
    .from('account_deletion_requests')
    .select('id, user_id, status')
    .eq('id', id)
    .single()

  if (fetchError || !row) {
    return NextResponse.json(
      { error: 'Deletion request not found' },
      { status: 404 }
    )
  }

  if (row.status !== 'pending') {
    return NextResponse.json(
      { error: 'Request is not pending' },
      { status: 400 }
    )
  }

  const { error: updateError } = await admin
    .from('account_deletion_requests')
    .update({
      status: 'rejected',
      rejected_reason: rejectedReason || null,
      reviewed_by: authResult.data.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Failed to reject request' },
      { status: 500 }
    )
  }

  logAudit({
    action: 'account_deletion_rejected',
    userId: authResult.data.user.id,
    resourceId: id,
    resourceType: 'account_deletion_request',
    result: 'success',
    timestamp: new Date().toISOString(),
    meta: { target_user_id: row.user_id },
  })

  return NextResponse.json({
    success: true,
    message: 'Deletion request rejected.',
  })
}
