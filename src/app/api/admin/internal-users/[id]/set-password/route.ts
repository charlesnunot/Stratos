/**
 * Admin-only: set or update password for an internal user so they can log in normally.
 * Never returns the password. Audit logged.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

const MIN_PASSWORD_LENGTH = 8

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) return authResult.response
    const adminUserId = authResult.data.user.id

    const { id: userId } = await params
    if (!userId) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()
    const { data: profile } = await admin
      .from('profiles')
      .select('id, user_origin')
      .eq('id', userId)
      .single()

    if (!profile || profile.user_origin !== 'internal') {
      return NextResponse.json(
        { error: 'Only internal users can have password set via this API' },
        { status: 400 }
      )
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password })
    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    try {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'internal_user_set_password',
        userId: adminUserId,
        resourceId: userId,
        resourceType: 'profile',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
    } catch (_) {}

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to set password'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
