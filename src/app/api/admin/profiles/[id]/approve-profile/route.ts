/**
 * 管理员审核通过用户资料：将 pending_* 写入主字段，清空 pending_*，profile_status = 'approved'
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: profileId } = await params
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }
    const { user } = authResult.data

    const admin = await getSupabaseAdmin()
  const { data: row, error: fetchError } = await admin
    .from('profiles')
    .select('id, display_name, username, avatar_url, bio, location, pending_display_name, pending_username, pending_avatar_url, pending_bio, pending_location, profile_status')
    .eq('id', profileId)
    .single()

  if (fetchError || !row || row.profile_status !== 'pending') {
    return NextResponse.json(
      { error: 'Profile not found or not pending' },
      { status: 400 }
    )
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      display_name: row.pending_display_name ?? row.display_name,
      username: row.pending_username ?? row.username,
      avatar_url: row.pending_avatar_url ?? row.avatar_url,
      bio: row.pending_bio ?? row.bio,
      location: row.pending_location ?? row.location,
      pending_display_name: null,
      pending_username: null,
      pending_avatar_url: null,
      pending_bio: null,
      pending_location: null,
      profile_status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId)

  if (updateError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Approve profile error:', updateError)
    }
    logAudit({
      action: 'profile_review_approve',
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
    action: 'profile_review_approve',
    userId: user.id,
    resourceId: profileId,
    resourceType: 'profile',
    result: 'success',
    timestamp: new Date().toISOString(),
  })

  // Notify user that profile was approved
  try {
    await admin
      .from('notifications')
      .insert({
        user_id: profileId,
        type: 'system',
        title: 'Profile Approved',
        content: 'Your profile has been approved',
        related_id: profileId,
        related_type: 'profile',
        link: '/profile/' + profileId,
        actor_id: user.id,
        content_key: 'profile_approved',
        content_params: {},
      })
  } catch (notifErr) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Profile approval notification failed:', notifErr)
    }
  }

  // Trigger AI translation for profile fields (async, non-blocking)
  fetch(`${request.nextUrl.origin}/api/ai/translate-profile-after-approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
    body: JSON.stringify({ profileId }),
  }).catch((err) => {
    console.error('[approve-profile] translate-profile-after-approval failed:', profileId, err)
    logAudit({
      action: 'ai_translate_profile',
      userId: user.id,
      resourceId: profileId,
      resourceType: 'profile',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: err.message || 'Translation service failed' },
    })
  })

  return NextResponse.json({ ok: true })
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[approve-profile]', e)
    }
    logAudit({
      action: 'profile_review_approve',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: e instanceof Error ? e.message : String(e) },
    })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
