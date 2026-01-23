import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    const { name, description, avatarUrl, memberIds } = await request.json()

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      )
    }

    // Use service role client for admin operations
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Create group conversation
    const { data: group, error: groupError } = await supabaseAdmin
      .from('conversations')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        avatar_url: avatarUrl || null,
        owner_id: user.id,
        conversation_type: 'group',
        participant1_id: user.id, // Keep for compatibility
        participant2_id: user.id, // Keep for compatibility
      })
      .select()
      .single()

    if (groupError || !group) {
      return NextResponse.json(
        { error: groupError?.message || 'Failed to create group' },
        { status: 500 }
      )
    }

    // Add owner as group member with owner role
    await supabaseAdmin.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'owner',
    })

    // Add other members
    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
      const memberInserts = memberIds
        .filter((id: string) => id !== user.id)
        .map((memberId: string) => ({
          group_id: group.id,
          user_id: memberId,
          role: 'member' as const,
        }))

      if (memberInserts.length > 0) {
        await supabaseAdmin.from('group_members').insert(memberInserts)

        // Create notifications for new members
        for (const memberId of memberIds) {
          if (memberId !== user.id) {
            await supabaseAdmin.from('notifications').insert({
              user_id: memberId,
              type: 'system',
              title: '加入群组',
              content: `您已被添加到群组 "${name.trim()}"`,
              related_id: group.id,
              related_type: 'user',
              link: `/groups/${group.id}`,
            })
          }
        }
      }
    }

    return NextResponse.json({ group })
  } catch (error: any) {
    console.error('Create group error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create group' },
      { status: 500 }
    )
  }
}
