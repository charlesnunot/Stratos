/**
 * POST /api/seller/upload-images-from-urls
 * Fetch images from external URLs, upload to Supabase Storage (products bucket),
 * return public URLs. Used by direct-seller product create/edit to "import" external images.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkSellerPermission } from '@/lib/auth/check-subscription'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  isValidHttpUrl,
  MAX_URLS,
  uploadImagesFromUrls,
} from '@/lib/products/upload-images-from-urls'

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

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const sellerCheck = await checkSellerPermission(user.id, supabaseAdmin)
    if (!sellerCheck.hasPermission) {
      return NextResponse.json(
        { error: sellerCheck.reason ?? 'Seller permission required' },
        { status: 403 }
      )
    }

    let body: { urls?: string[] }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const raw = body.urls
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { error: 'urls must be a non-empty array' },
        { status: 400 }
      )
    }
    if (raw.length > MAX_URLS) {
      return NextResponse.json(
        { error: `At most ${MAX_URLS} URLs allowed` },
        { status: 400 }
      )
    }

    const urls = raw
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter(Boolean)
      .filter(isValidHttpUrl)

    if (urls.length !== raw.length) {
      return NextResponse.json(
        { error: 'All entries must be valid http(s) URLs' },
        { status: 400 }
      )
    }

    const publicUrls = await uploadImagesFromUrls(supabase, user.id, urls)
    return NextResponse.json({ urls: publicUrls })
  } catch (e) {
    console.error('upload-images-from-urls error:', e)
    const message = e instanceof Error ? e.message : 'Server error'
    const status = message.includes('HTTP ') ? 400 : message.includes('upload failed') ? 500 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
