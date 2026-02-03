import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_NAME = 80
const MAX_DESC = 500

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
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const description = typeof body?.description === 'string' ? body.description.trim().slice(0, MAX_DESC) : null

    if (!name || name.length > MAX_NAME) {
      return NextResponse.json({ error: 'name_required_or_too_long' }, { status: 400 })
    }

    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!SLUG_REGEX.test(finalSlug)) {
      return NextResponse.json({ error: 'invalid_slug' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('community_groups')
      .select('id')
      .eq('slug', finalSlug)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    }

    const { data: group, error } = await supabase
      .from('community_groups')
      .insert({
        name,
        slug: finalSlug,
        description: description || null,
        cover_url: null,
        created_by: user.id,
      })
      .select('id, name, slug, description, member_count, created_at')
      .single()

    if (error) {
      if (process.env.NODE_ENV === 'development') console.error('[community-groups/create]', error)
      return NextResponse.json({ error: 'create_failed' }, { status: 500 })
    }

    return NextResponse.json({ group })
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[community-groups/create]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
