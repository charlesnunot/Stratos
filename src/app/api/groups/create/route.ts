import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

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

    const nameTrimmed = typeof name === 'string' ? name.trim() : ''
    if (!nameTrimmed) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      )
    }
    if (nameTrimmed.length > 100) {
      return NextResponse.json(
        { error: 'Group name must be at most 100 characters' },
        { status: 400 }
      )
    }
    const descriptionTrimmed =
      description != null && typeof description === 'string'
        ? description.trim().slice(0, 500)
        : null

    const supabaseAdmin = await getSupabaseAdmin()

    // Create group conversation
    const { data: group, error: groupError } = await supabaseAdmin
      .from('conversations')
      .insert({
        name: nameTrimmed,
        description: descriptionTrimmed,
        avatar_url: avatarUrl || null,
        owner_id: user.id,
        conversation_type: 'group',
        participant1_id: user.id, // Keep for compatibility
        participant2_id: user.id, // Keep for compatibility
      })
      .select()
      .single()

    if (groupError || !group) {
      logAudit({
        action: 'group_create',
        userId: user.id,
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: groupError?.message },
      })
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

        // Create notifications for new members (use content_key for i18n)
        for (const memberId of memberIds) {
          if (memberId !== user.id) {
            await supabaseAdmin.from('notifications').insert({
              user_id: memberId,
              type: 'system',
              title: 'Added to Group',
              content: `You have been added to group "${nameTrimmed}"`,
              related_id: group.id,
              related_type: 'conversation',
              link: `/messages/${group.id}`,
              actor_id: user.id,
              content_key: 'group_invite',
              content_params: { groupName: nameTrimmed },
            })
          }
        }
      }
    }

    logAudit({
      action: 'group_create',
      userId: user.id,
      resourceId: group.id,
      resourceType: 'conversation',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { memberCount: 1 + (memberIds?.filter((id: string) => id !== user.id).length ?? 0) },
    })

    return NextResponse.json({ group })
  } catch (err: unknown) {
    console.error('Create group error:', err)
    const message = err instanceof Error ? err.message : 'Failed to create group'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
