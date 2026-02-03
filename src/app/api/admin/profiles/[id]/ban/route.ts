/**
 * 管理员/客服封禁用户：将 profiles.status 设为 'banned'
 * 使用 service role 绕过 RLS，并记录审计日志
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }
    const { user } = authResult.data

    const { id: profileId } = await params
    if (!profileId) {
      return NextResponse.json({ error: 'Missing profile id' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    const { data: target, error: fetchError } = await admin
      .from('profiles')
      .select('id, status')
      .eq('id', profileId)
      .single()

    if (fetchError || !target) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (target.status === 'banned') {
      return NextResponse.json({ error: 'User is already banned' }, { status: 400 })
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        status: 'banned',
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)

    if (updateError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Ban profile error:', updateError)
      }
      logAudit({
        action: 'profile_ban',
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
      action: 'profile_ban',
      userId: user.id,
      resourceId: profileId,
      resourceType: 'profile',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {},
    })

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Ban profile error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to ban user'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
