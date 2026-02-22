/**
 * Seller API: API Key Management (Single Key)
 * DELETE: Revoke API key
 * PATCH: Update API key
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

// DELETE: Revoke API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Verify the key belongs to the user
    const { data: key } = await supabase
      .from('seller_api_keys')
      .select('id')
      .eq('id', id)
      .eq('seller_id', user.id)
      .single()

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    // Revoke the key
    const admin = await getSupabaseAdmin()
    const { error } = await admin
      .from('seller_api_keys')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      console.error('[seller/api-keys DELETE] Error:', error)
      return NextResponse.json(
        { error: 'Failed to revoke API key', details: error.message },
        { status: 500 }
      )
    }

    // Log audit
    logAudit({
      action: 'revoke_api_key',
      userId: user.id,
      resourceId: id,
      resourceType: 'seller_api_key',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: 'API key revoked' })
  } catch (error: unknown) {
    console.error('[seller/api-keys DELETE] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH: Update API key
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()

    // Verify the key belongs to the user
    const { data: key } = await supabase
      .from('seller_api_keys')
      .select('id')
      .eq('id', id)
      .eq('seller_id', user.id)
      .single()

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    // Update allowed fields
    const updates: any = {}
    if (body.keyName) updates.key_name = body.keyName
    if (body.permissions) updates.permissions = body.permissions
    if (body.rateLimit) updates.rate_limit_per_minute = body.rateLimit
    if (body.dailyQuota) updates.daily_quota = body.dailyQuota
    if (body.expiresAt !== undefined) updates.expires_at = body.expiresAt
    if (body.isActive !== undefined) updates.is_active = body.isActive

    const admin = await getSupabaseAdmin()
    const { data: updatedKey, error } = await admin
      .from('seller_api_keys')
      .update(updates)
      .eq('id', id)
      .select('id, key_name, api_key_prefix, permissions, rate_limit_per_minute, daily_quota, is_active, expires_at, updated_at')
      .single()

    if (error) {
      console.error('[seller/api-keys PATCH] Error:', error)
      return NextResponse.json(
        { error: 'Failed to update API key', details: error.message },
        { status: 500 }
      )
    }

    // Log audit
    logAudit({
      action: 'update_api_key',
      userId: user.id,
      resourceId: id,
      resourceType: 'seller_api_key',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ key: updatedKey })
  } catch (error: unknown) {
    console.error('[seller/api-keys PATCH] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
