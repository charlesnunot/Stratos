/**
 * Seller API: API Key Management
 * GET: List API keys
 * POST: Create new API key
 * DELETE: Revoke API key
 * Only available for Scale ($100) tier sellers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { randomBytes } from 'crypto'

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
  
  // Only Scale (100) can use API access
  if (tier < 100) {
    return { valid: false, error: 'API access requires Scale tier subscription' }
  }

  return { valid: true }
}

// Generate API key
function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = 'sk_' + randomBytes(32).toString('hex')
  const prefix = key.substring(0, 10)
  const hash = require('crypto').createHash('sha256').update(key).digest('hex')
  return { key, prefix, hash }
}

// GET: List API keys
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

    // Get API keys (without hash)
    const { data: keys, error } = await supabase
      .from('seller_api_keys')
      .select('id, key_name, api_key_prefix, permissions, rate_limit_per_minute, daily_quota, is_active, expires_at, last_used_at, request_count, created_at')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[seller/api-keys GET] Error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch API keys', details: error.message },
        { status: 500 }
      )
    }

    // Get usage stats
    const { data: stats } = await supabase
      .from('seller_api_stats')
      .select('*')
      .eq('seller_id', user.id)
      .single()

    return NextResponse.json({ keys: keys || [], stats: stats || null })
  } catch (error: unknown) {
    console.error('[seller/api-keys GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Create new API key
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
    const { keyName, permissions, rateLimit, dailyQuota, expiresAt } = body

    if (!keyName) {
      return NextResponse.json({ error: 'Key name is required' }, { status: 400 })
    }

    // Check key limit (max 5 keys per seller)
    const { count } = await supabase
      .from('seller_api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', user.id)
      .eq('is_active', true)

    if (count && count >= 5) {
      return NextResponse.json(
        { error: 'Maximum 5 API keys allowed. Please revoke an existing key first.' },
        { status: 400 }
      )
    }

    // Generate new key
    const { key, prefix, hash } = generateApiKey()
    const admin = await getSupabaseAdmin()

    const { data: newKey, error } = await admin
      .from('seller_api_keys')
      .insert({
        seller_id: user.id,
        key_name: keyName,
        api_key_hash: hash,
        api_key_prefix: prefix,
        permissions: permissions || ['read:products', 'read:orders'],
        rate_limit_per_minute: rateLimit || 60,
        daily_quota: dailyQuota || 1000,
        expires_at: expiresAt || null,
        is_active: true,
      })
      .select('id, key_name, api_key_prefix, permissions, rate_limit_per_minute, daily_quota, is_active, expires_at, created_at')
      .single()

    if (error) {
      console.error('[seller/api-keys POST] Error:', error)
      return NextResponse.json(
        { error: 'Failed to create API key', details: error.message },
        { status: 500 }
      )
    }

    // Log audit
    logAudit({
      action: 'create_api_key',
      userId: user.id,
      resourceId: newKey.id,
      resourceType: 'seller_api_key',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    // Return the full key only once
    return NextResponse.json({
      key: newKey,
      fullKey: key, // This is the only time the full key is returned
      message: 'Please save this API key. It will not be shown again.',
    })
  } catch (error: unknown) {
    console.error('[seller/api-keys POST] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
