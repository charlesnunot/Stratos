/**
 * Admin-only: set an existing internal user as direct seller.
 * Updates profile (role=seller, seller_type=direct) and ensures an active seller subscription.
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
    const { user: adminUser } = authResult.data

    const { id: profileId } = await params
    if (!profileId) {
      return NextResponse.json({ error: 'Missing profile id' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    const { data: profile, error: fetchError } = await admin
      .from('profiles')
      .select('id, user_origin, role, seller_type')
      .eq('id', profileId)
      .single()

    if (fetchError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    if (profile.user_origin !== 'internal') {
      return NextResponse.json(
        { error: 'Only internal users can be set as direct seller via this API' },
        { status: 400 }
      )
    }

    const beforeType = (profile.seller_type as 'external' | 'direct') || 'external'

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        role: 'seller',
        seller_type: 'direct',
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Direct sellers: do not create or rely on seller subscription; useSellerGuard allows by seller_type=direct

    if (beforeType !== 'direct') {
      await admin.from('seller_type_audit_logs').insert({
        seller_id: profileId,
        operator_admin_id: adminUser.id,
        before_type: beforeType,
        after_type: 'direct',
      })
    }

    return NextResponse.json({ ok: true, role: 'seller', seller_type: 'direct' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to set direct seller'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
