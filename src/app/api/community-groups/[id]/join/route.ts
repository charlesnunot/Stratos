import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { error } = await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: user.id,
      role: 'member',
    })

    if (error) {
      if (error.code === '23505') return NextResponse.json({ ok: true, already: true })
      if (process.env.NODE_ENV === 'development') console.error('[community-groups/join]', error)
      return NextResponse.json({ error: 'join_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.error('[community-groups/join]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
