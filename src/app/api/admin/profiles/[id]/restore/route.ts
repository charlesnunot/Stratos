/**
 * POST /api/admin/profiles/[id]/restore — 管理员恢复已注销用户（将 status 设为 active）
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

  const { id: userId } = await params
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  const admin = await getSupabaseAdmin()

  const { data: profile, error: fetchError } = await admin
    .from('profiles')
    .select('id, status')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  if (profile.status !== 'deleted') {
    return NextResponse.json(
      { error: 'User is not deleted. Only deleted accounts can be restored.' },
      { status: 400 }
    )
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Failed to restore profile' },
      { status: 500 }
    )
  }

  logAudit({
    action: 'account_restored_by_admin',
    userId: authResult.data.user.id,
    resourceId: userId,
    resourceType: 'profile',
    result: 'success',
    timestamp: new Date().toISOString(),
    meta: { target_user_id: userId },
  })

  return NextResponse.json({
    success: true,
    message: 'Account restored successfully.',
  })
}
