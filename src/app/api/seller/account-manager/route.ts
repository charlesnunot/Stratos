/**
 * Seller API: Get my account manager
 * GET: Get assigned account manager info
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get account manager info from view
    const { data: assignment, error } = await supabase
      .from('seller_account_manager_view')
      .select('*')
      .eq('seller_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return NextResponse.json({
          hasManager: false,
          message: 'No account manager assigned',
        })
      }
      console.error('[seller/account-manager GET] Error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch account manager info' },
        { status: 500 }
      )
    }

    if (!assignment?.manager_id) {
      return NextResponse.json({
        hasManager: false,
        message: 'No account manager assigned',
      })
    }

    return NextResponse.json({
      hasManager: true,
      manager: {
        id: assignment.manager_id,
        name: assignment.manager_name,
        email: assignment.manager_email,
        phone: assignment.manager_phone,
        avatar_url: assignment.manager_avatar,
        title: assignment.manager_title,
        working_hours: assignment.working_hours,
        languages: assignment.languages,
      },
      assignment: {
        assigned_at: assignment.assigned_at,
        last_contact_at: assignment.last_contact_at,
      },
    })
  } catch (error: unknown) {
    console.error('[seller/account-manager GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
