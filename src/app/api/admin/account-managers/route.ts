/**
 * Admin API: Account Manager Management
 * GET: List all account managers
 * POST: Create new account manager
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logAudit } from '@/lib/api/audit'

// GET: List account managers
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const includeStats = searchParams.get('stats') === 'true'

    let query = supabase.from('account_managers').select('*')

    if (includeStats) {
      query = supabase.from('account_manager_stats').select('*')
    }

    const { data: managers, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[admin/account-managers GET] Error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch account managers', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ managers: managers || [] })
  } catch (error: unknown) {
    console.error('[admin/account-managers GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Create account manager
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }
    const actorUserId = authResult.data.user.id

    const supabase = await createClient()

    const body = await request.json()
    const {
      admin_id,
      name,
      email,
      phone,
      title,
      bio,
      max_clients,
      working_hours,
      languages,
    } = body

    // Validate required fields
    if (!admin_id || !name || !email) {
      return NextResponse.json(
        { error: 'admin_id, name, and email are required' },
        { status: 400 }
      )
    }

    // Check if admin_id is valid and has admin role
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', admin_id)
      .single()

    if (adminError || !adminProfile) {
      return NextResponse.json({ error: 'Invalid admin_id' }, { status: 400 })
    }

    if (!['admin', 'support'].includes(adminProfile.role || '')) {
      return NextResponse.json(
        { error: 'User must be admin or support to be an account manager' },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()

    const { data: manager, error: insertError } = await admin
      .from('account_managers')
      .insert({
        admin_id,
        name,
        email,
        phone,
        title: title || '客户经理',
        bio,
        max_clients: max_clients || 50,
        working_hours,
        languages: languages || ['zh', 'en'],
      })
      .select()
      .single()

    if (insertError) {
      console.error('[admin/account-managers POST] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create account manager', details: insertError.message },
        { status: 500 }
      )
    }

    logAudit({
      action: 'create_account_manager',
      userId: actorUserId,
      resourceId: manager.id,
      resourceType: 'account_manager',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { admin_id, name },
    })

    return NextResponse.json({ manager }, { status: 201 })
  } catch (error: unknown) {
    console.error('[admin/account-managers POST] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
