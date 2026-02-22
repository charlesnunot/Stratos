/**
 * Seller API: Branding Configuration
 * GET: Get seller branding config
 * POST/PUT: Update branding config
 * Only available for Scale ($100) tier sellers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

// Validate seller tier
async function validateSellerTier(supabase: any, userId: string): Promise<{ valid: boolean; error?: string }> {
  // Check if direct seller
  const { data: profile } = await supabase
    .from('profiles')
    .select('seller_type, role')
    .eq('id', userId)
    .single()

  if (profile?.seller_type === 'direct') {
    return { valid: true }
  }

  // Check subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .eq('subscription_type', 'seller')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()

  if (!subscription) {
    return { valid: false, error: 'No active seller subscription' }
  }

  const tier = subscription.subscription_tier
  
  // Only Scale (100) can use branding
  if (tier < 100) {
    return { valid: false, error: 'Custom branding requires Scale tier subscription' }
  }

  return { valid: true }
}

// GET: Get branding config
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

    // Validate seller tier
    const tierCheck = await validateSellerTier(supabase, user.id)
    if (!tierCheck.valid) {
      return NextResponse.json({ error: tierCheck.error }, { status: 403 })
    }

    // Get branding config
    const { data: branding, error } = await supabase
      .from('seller_branding')
      .select('*')
      .eq('seller_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[seller/branding GET] Error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch branding config', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ branding: branding || null })
  } catch (error: unknown) {
    console.error('[seller/branding GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Create or update branding config
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate seller tier
    const tierCheck = await validateSellerTier(supabase, user.id)
    if (!tierCheck.valid) {
      return NextResponse.json({ error: tierCheck.error }, { status: 403 })
    }

    const body = await request.json()
    const admin = await getSupabaseAdmin()

    // Check if branding config exists
    const { data: existing } = await admin
      .from('seller_branding')
      .select('id')
      .eq('seller_id', user.id)
      .single()

    let result
    if (existing) {
      // Update existing
      result = await admin
        .from('seller_branding')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq('seller_id', user.id)
        .select()
        .single()
    } else {
      // Create new
      result = await admin
        .from('seller_branding')
        .insert({
          seller_id: user.id,
          ...body,
        })
        .select()
        .single()
    }

    if (result.error) {
      console.error('[seller/branding POST] Error:', result.error)
      return NextResponse.json(
        { error: 'Failed to save branding config', details: result.error.message },
        { status: 500 }
      )
    }

    // Log audit
    logAudit({
      action: existing ? 'update_branding' : 'create_branding',
      userId: user.id,
      resourceId: result.data.id,
      resourceType: 'seller_branding',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ branding: result.data })
  } catch (error: unknown) {
    console.error('[seller/branding POST] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
