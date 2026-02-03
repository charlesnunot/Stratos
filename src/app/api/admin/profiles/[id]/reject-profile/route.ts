/**
 * 管理员驳回用户资料修改：清空 pending_*，profile_status = 'approved'（保持主字段不变）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: profileId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = await getSupabaseAdmin()
  const { error: updateError } = await admin
    .from('profiles')
    .update({
      pending_display_name: null,
      pending_username: null,
      pending_avatar_url: null,
      pending_bio: null,
      pending_location: null,
      profile_status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .eq('profile_status', 'pending')

  if (updateError) {
    console.error('Reject profile error:', updateError)
    logAudit({
      action: 'reject_profile',
      userId: user.id,
      resourceId: profileId,
      resourceType: 'profile',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: updateError.message },
    })
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  logAudit({
    action: 'reject_profile',
    userId: user.id,
    resourceId: profileId,
    resourceType: 'profile',
    result: 'success',
    timestamp: new Date().toISOString(),
  })

  // Notify user that profile was rejected
  try {
    await admin.from('notifications').insert({
      user_id: profileId,
      type: 'system',
      title: 'Profile Changes Rejected',
      content: 'Your profile changes were not approved',
      related_id: profileId,
      related_type: 'profile',
      link: '/profile/' + profileId,
      actor_id: user.id,
      content_key: 'profile_rejected',
      content_params: {},
    })
  } catch (notifErr) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Profile rejection notification failed:', notifErr)
    }
  }

  return NextResponse.json({ ok: true })
}
