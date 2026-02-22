/**
 * Admin-only: set profile seller_type (external | direct).
 * Writes to seller_type_audit_logs. Used for cold-start direct sellers.
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
    const { user } = authResult.data

    const { id: profileId } = await params
    if (!profileId) {
      return NextResponse.json({ error: 'Missing profile id' }, { status: 400 })
    }

    const body = await request.json()
    const sellerType = body.seller_type as string
    if (sellerType !== 'external' && sellerType !== 'direct') {
      return NextResponse.json(
        { error: 'Invalid seller_type; must be "external" or "direct"' },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()
    const { data: profile, error: fetchError } = await admin
      .from('profiles')
      .select('id, seller_type')
      .eq('id', profileId)
      .single()

    if (fetchError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const beforeType = (profile.seller_type as 'external' | 'direct') || 'external'
    if (beforeType === sellerType) {
      return NextResponse.json({ ok: true, seller_type: sellerType })
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        seller_type: sellerType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await admin.from('seller_type_audit_logs').insert({
      seller_id: profileId,
      operator_admin_id: user.id,
      before_type: beforeType,
      after_type: sellerType,
    })

    return NextResponse.json({ ok: true, seller_type: sellerType })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update seller type'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
