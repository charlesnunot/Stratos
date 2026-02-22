/**
 * Admin API: Assign account manager to seller
 * POST: Assign or reassign account manager
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit } from '@/lib/api/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const managerId = params.id
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    const actorUserId = authResult.data.user.id

    const supabase = await createClient()

    const body = await request.json()
    const { seller_id, notes } = body

    if (!seller_id) {
      return NextResponse.json({ error: 'seller_id is required' }, { status: 400 })
    }

    // Check if seller exists and is Scale tier
    const { data: sellerData, error: sellerError } = await supabase
      .from('profiles')
      .select(`
        id,
        role,
        seller_type,
        subscriptions!inner(subscription_tier, status, expires_at)
      `)
      .eq('id', seller_id)
      .eq('subscriptions.subscription_type', 'seller')
      .eq('subscriptions.status', 'active')
      .single()

    if (sellerError || !sellerData) {
      return NextResponse.json(
        { error: 'Seller not found or does not have active subscription' },
        { status: 404 }
      )
    }

    // Check if seller is Scale tier (subscription_tier = 100)
    const subscription = Array.isArray(sellerData.subscriptions) 
      ? sellerData.subscriptions[0] 
      : sellerData.subscriptions

    if (subscription?.subscription_tier !== 100) {
      return NextResponse.json(
        { error: 'Only Scale tier sellers can have account managers' },
        { status: 400 }
      )
    }

    // Check if manager exists and has capacity
    const { data: manager, error: managerError } = await supabase
      .from('account_managers')
      .select('*')
      .eq('id', managerId)
      .eq('is_active', true)
      .single()

    if (managerError || !manager) {
      return NextResponse.json(
        { error: 'Account manager not found or inactive' },
        { status: 404 }
      )
    }

    if (manager.current_clients >= manager.max_clients) {
      return NextResponse.json(
        { error: 'Account manager has reached maximum client capacity' },
        { status: 400 }
      )
    }

    // Call the assign function
    const { data: success, error: assignError } = await supabase.rpc(
      'assign_account_manager',
      {
        p_seller_id: seller_id,
        p_manager_id: managerId,
        p_assigned_by: actorUserId,
        p_notes: notes || null,
      }
    )

    if (assignError) {
      console.error('[admin/account-managers/assign POST] Assign error:', assignError)
      return NextResponse.json(
        { error: 'Failed to assign account manager', details: assignError.message },
        { status: 500 }
      )
    }

    logAudit({
      action: 'assign_account_manager',
      userId: actorUserId,
      resourceId: managerId,
      resourceType: 'account_manager',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { seller_id, manager_id: managerId },
    })

    return NextResponse.json({
      success: true,
      message: 'Account manager assigned successfully',
    })
  } catch (error: unknown) {
    console.error('[admin/account-managers/assign POST] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
