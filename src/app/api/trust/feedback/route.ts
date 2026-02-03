/**
 * Phase 2 trust judgment: POST user agree/disagree feedback.
 * Stores for future rule tuning; first version does not affect judgment logic.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_REASONS = ['price', 'seller', 'description'] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : null
    const sellerId = typeof body?.sellerId === 'string' ? body.sellerId.trim() : null
    const agreed = typeof body?.agreed === 'boolean' ? body.agreed : null
    const reason =
      typeof body?.reason === 'string' && VALID_REASONS.includes(body.reason as (typeof VALID_REASONS)[number])
        ? body.reason
        : null

    if (!productId || !sellerId || agreed === null) {
      return NextResponse.json(
        { error: 'missing productId, sellerId, or agreed' },
        { status: 400 }
      )
    }

    const { error } = await supabase.from('trust_judgment_feedback').insert({
      product_id: productId,
      seller_id: sellerId,
      user_id: user.id,
      agreed,
      reason: agreed ? null : reason ?? null,
    })

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[trust/feedback]', error)
      }
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[trust/feedback]', err)
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
