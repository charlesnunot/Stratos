/**
 * POST /api/admin/deletion-requests/[id]/approve — 通过注销申请并执行软删除
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { executeSoftDelete } from '@/lib/account/execute-soft-delete'
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

  const { error: softDeleteError } = await executeSoftDelete(admin, row.user_id)
  if (softDeleteError) {
    return NextResponse.json(
      { error: softDeleteError || 'Failed to soft-delete profile' },
      { status: 500 }
    )
  }

  const { error: updateError } = await admin
    .from('account_deletion_requests')
    .update({
      status: 'approved',
      reviewed_by: authResult.data.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Failed to update request status' },
      { status: 500 }
    )
  }

  logAudit({
    action: 'account_deletion_approved',
    userId: authResult.data.user.id,
    resourceId: id,
    resourceType: 'account_deletion_request',
    result: 'success',
    timestamp: new Date().toISOString(),
    meta: { target_user_id: row.user_id },
  })

  return NextResponse.json({
    success: true,
    message: 'Account deletion approved and profile soft-deleted.',
  })
}
