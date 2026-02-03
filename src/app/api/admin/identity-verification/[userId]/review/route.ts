/**
 * POST /api/admin/identity-verification/[userId]/review — 管理员审核实名认证（通过/驳回）
 * Body: { status: 'verified' | 'rejected', rejected_reason?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireAdminOrSupport(request)
  if (!authResult.success) return authResult.response

  const { user: adminUser } = authResult.data
  const { userId } = await params

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  let body: { status?: string; rejected_reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const status = body.status === 'verified' ? 'verified' : body.status === 'rejected' ? 'rejected' : null
  if (!status) {
    return NextResponse.json(
      { error: 'status must be "verified" or "rejected"' },
      { status: 400 }
    )
  }

  const rejectedReason = status === 'rejected'
    ? (typeof body.rejected_reason === 'string' ? body.rejected_reason.trim().slice(0, 500) : null)
    : null

  const admin = await getSupabaseAdmin()

  const { data: row, error: fetchError } = await admin
    .from('identity_verifications')
    .select('user_id, status')
    .eq('user_id', userId)
    .single()

  if (fetchError || !row) {
    return NextResponse.json(
      { error: 'Verification not found' },
      { status: 404 }
    )
  }

  if (row.status !== 'pending') {
    return NextResponse.json(
      { error: 'Not pending review' },
      { status: 400 }
    )
  }

  const { error: updateError } = await admin
    .from('identity_verifications')
    .update({
      status,
      rejected_reason: rejectedReason,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Failed to update' },
      { status: 500 }
    )
  }

  // 通知被审核用户
  try {
    const isApproved = status === 'verified'
    await admin.from('notifications').insert({
      user_id: userId,
      type: 'system',
      title: isApproved ? '实名认证已通过' : '实名认证未通过',
      content: isApproved
        ? '您的实名认证已审核通过。'
        : (rejectedReason
            ? `您的实名认证未通过审核。原因：${rejectedReason}。请修改后重新提交。`
            : '您的实名认证未通过审核，请修改后重新提交。'),
      related_id: userId,
      related_type: 'identity_verification',
      link: '/settings',
      actor_id: adminUser.id,
      content_key: isApproved ? 'identity_verification_approved' : 'identity_verification_rejected',
      content_params: isApproved ? {} : { reason: rejectedReason ?? '' },
    })
  } catch (notifErr) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[identity-verification/review] notification failed:', notifErr)
    }
  }

  logAudit({
    action: status === 'verified' ? 'identity_verification_approve' : 'identity_verification_reject',
    userId: adminUser.id,
    resourceId: userId,
    resourceType: 'identity_verification',
    result: 'success',
    timestamp: new Date().toISOString(),
    meta: { status, rejected_reason: rejectedReason ?? undefined },
  })

  return NextResponse.json({ success: true, status })
}
