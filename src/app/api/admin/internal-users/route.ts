/**
 * Admin-only: create an internal user (system principal).
 * Internal users may be created with optional email+password for normal login; otherwise system-only (no login).
 * Never return password; set metadata internal=true. Do not send confirmation email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { generateDefaultUsername } from '@/lib/username'
import { randomBytes } from 'crypto'

const MIN_PASSWORD_LENGTH = 8
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) return authResult.response

    const admin = await getSupabaseAdmin()
    const { data: profiles, error: listError } = await admin
      .from('profiles')
      .select('id, username, display_name, user_origin, role, seller_type, internal_tip_enabled, internal_affiliate_enabled, created_at')
      .eq('user_origin', 'internal')
      .order('created_at', { ascending: false })

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const withEmails = await Promise.all(
      (profiles || []).map(async (p) => {
        const { data: authUser } = await admin.auth.admin.getUserById(p.id)
        return { ...p, email: authUser?.user?.email ?? null }
      })
    )
    return NextResponse.json(withEmails)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list internal users'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request)
    if (!authResult.success) return authResult.response

    const body = await request.json()
    const display_name = (body.display_name as string)?.trim()
    const usernameInput = (body.username as string)?.trim()
    const role = (body.role as string) || 'user'
    const seller_type = body.seller_type as string | undefined
    const intent = body.intent as string | undefined
    const emailInput = (body.email as string)?.trim()
    const passwordInput = (body.password as string) || ''

    if (!display_name) {
      return NextResponse.json(
        { error: 'display_name is required' },
        { status: 400 }
      )
    }

    const wantLoginable = !!emailInput || !!passwordInput
    if (wantLoginable) {
      if (!emailInput || !passwordInput) {
        return NextResponse.json(
          { error: 'When enabling login, both email and password are required' },
          { status: 400 }
        )
      }
      if (!EMAIL_REGEX.test(emailInput)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        )
      }
      if (passwordInput.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
          { status: 400 }
        )
      }
    }

    const admin = await getSupabaseAdmin()

    const internalId = randomBytes(8).toString('hex')
    const email = wantLoginable ? emailInput : `internal+${internalId}@internal.local`
    const password = wantLoginable ? passwordInput : randomBytes(32).toString('hex')

    const { data: authUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { internal: true },
      app_metadata: { internal: true },
    })

    if (createError || !authUser?.user) {
      return NextResponse.json(
        { error: createError?.message || 'Failed to create auth user' },
        { status: 500 }
      )
    }

    const username = usernameInput || generateDefaultUsername(authUser.user.id)

    // Trigger handle_new_user() already inserted a profile row; update it instead of insert to avoid profiles_pkey conflict.
    const profileUpdate: Record<string, unknown> = {
      username,
      display_name,
      user_origin: 'internal',
      role: role === 'seller' ? 'seller' : 'user',
    }
    if (seller_type === 'direct' || seller_type === 'external') {
      profileUpdate.seller_type = seller_type
    }

    const { data: updated, error: profileError } = await admin
      .from('profiles')
      .update(profileUpdate)
      .eq('id', authUser.user.id)
      .select('id')
      .maybeSingle()

    if (profileError || !updated) {
      await admin.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json(
        { error: profileError?.message ?? 'Profile update failed (trigger may not have created row)' },
        { status: 500 }
      )
    }

    // When creating as external seller, grant an active seller subscription. Direct sellers do not need one.
    if (role === 'seller' && seller_type !== 'direct') {
      const startsAt = new Date()
      const expiresAt = new Date(startsAt)
      expiresAt.setFullYear(expiresAt.getFullYear() + 10)
      const { error: subError } = await admin.from('subscriptions').insert({
        user_id: authUser.user.id,
        subscription_type: 'seller',
        payment_method: 'bank',
        amount: 0,
        status: 'active',
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        subscription_tier: 10,
        deposit_credit: 10,
      })
      if (!subError) {
        await admin.rpc('sync_profile_subscription_derived', { p_user_id: authUser.user.id })
      }
    }

    if (intent) {
      try {
        const { logAudit } = await import('@/lib/api/audit')
        logAudit({
          action: 'internal_user_create',
          userId: authResult.data.user.id,
          resourceId: authUser.user.id,
          resourceType: 'profile',
          result: 'success',
          timestamp: new Date().toISOString(),
          meta: { intent, username, display_name },
        })
      } catch (_) {}
    }

    const payload: { id: string; username: string; display_name: string; user_origin: string; email?: string } = {
      id: authUser.user.id,
      username,
      display_name,
      user_origin: 'internal',
    }
    if (wantLoginable) payload.email = email
    return NextResponse.json(payload)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create internal user'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
