/**
 * Admin authorization utilities
 * Provides unified admin role checking for API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface AdminCheckResult {
  user: { id: string }
  profile: { role: string }
  supabase: Awaited<ReturnType<typeof createClient>>
}

/**
 * Require user to be admin
 * Returns 401/403 if not authorized, or admin data if authorized
 */
export async function requireAdmin(
  request: NextRequest
): Promise<{ success: true; data: AdminCheckResult } | { success: false; response: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
    }
  }

  if (profile.role !== 'admin') {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    data: { user, profile, supabase },
  }
}

/**
 * Require user to be admin or support
 */
export async function requireAdminOrSupport(
  request: NextRequest
): Promise<{ success: true; data: AdminCheckResult } | { success: false; response: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
    }
  }

  if (profile.role !== 'admin' && profile.role !== 'support') {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Admin or support access required' },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    data: { user, profile, supabase },
  }
}
