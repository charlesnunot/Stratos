/**
 * Admin-only: set tip/affiliate flags for internal users (no subscription required).
 * Only applies when user_origin=internal.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) return authResult.response

    const { id: profileId } = await params
    if (!profileId) {
      return NextResponse.json({ error: 'Missing profile id' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const internal_tip_enabled = body.internal_tip_enabled as boolean | undefined
    const internal_affiliate_enabled = body.internal_affiliate_enabled as boolean | undefined

    if (internal_tip_enabled === undefined && internal_affiliate_enabled === undefined) {
      return NextResponse.json(
        { error: 'Provide at least one of internal_tip_enabled, internal_affiliate_enabled' },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()
    const { data: profile, error: fetchError } = await admin
      .from('profiles')
      .select('id, user_origin')
      .eq('id', profileId)
      .single()

    if (fetchError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    if (profile.user_origin !== 'internal') {
      return NextResponse.json(
        { error: 'Only internal users can have internal_tip_enabled / internal_affiliate_enabled set' },
        { status: 400 }
      )
    }

    const update: Record<string, boolean> = {}
    if (internal_tip_enabled !== undefined) update.internal_tip_enabled = internal_tip_enabled
    if (internal_affiliate_enabled !== undefined) update.internal_affiliate_enabled = internal_affiliate_enabled

    const { error: updateError } = await admin
      .from('profiles')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', profileId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      internal_tip_enabled: update.internal_tip_enabled,
      internal_affiliate_enabled: update.internal_affiliate_enabled,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update tip/affiliate'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
