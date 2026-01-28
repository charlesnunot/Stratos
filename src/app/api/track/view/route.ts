import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const TRACK_SESSION_COOKIE = 'track_sid'
const SESSION_MAX_AGE = 365 * 24 * 60 * 60 // 1 year

type EntityType = 'post' | 'product' | 'profile'

function isValidUuid(s: string): boolean {
  const u =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return u.test(s)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entityType = body?.entityType as EntityType | undefined
    const entityId = body?.entityId as string | undefined

    if (
      !entityType ||
      !entityId ||
      !['post', 'product', 'profile'].includes(entityType) ||
      !isValidUuid(entityId)
    ) {
      return NextResponse.json(
        { error: 'Invalid entityType or entityId' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    let ownerId: string | null = null

    if (entityType === 'post') {
      const { data } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', entityId)
        .eq('status', 'approved')
        .single()
      ownerId = data?.user_id ?? null
    } else if (entityType === 'product') {
      const { data } = await supabase
        .from('products')
        .select('seller_id')
        .eq('id', entityId)
        .eq('status', 'active')
        .single()
      ownerId = data?.seller_id ?? null
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', entityId)
        .single()
      ownerId = data?.id ?? null
    }

    if (!ownerId) {
      return NextResponse.json(
        { error: 'Entity not found or not viewable' },
        { status: 404 }
      )
    }

    const { data: { user } } = await supabase.auth.getUser()
    const cookieStore = await cookies()
    let sessionId = cookieStore.get(TRACK_SESSION_COOKIE)?.value
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      cookieStore.set(TRACK_SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })
    }

    const { error } = await supabase.from('view_events').insert({
      entity_type: entityType,
      entity_id: entityId,
      viewer_id: user?.id ?? null,
      session_id: sessionId,
      viewed_at: new Date().toISOString(),
      owner_id: ownerId,
    })

    if (error) {
      console.error('[track/view] insert error:', error)
      return NextResponse.json({ error: 'Failed to record view' }, { status: 500 })
    }

    return new NextResponse(null, { status: 204 })
  } catch (e) {
    console.error('[track/view]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
