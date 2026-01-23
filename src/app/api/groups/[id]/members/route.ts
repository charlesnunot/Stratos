import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Add members to a group
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const groupId = params.id
    const { memberIds } = await request.json()

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: 'Member IDs required' },
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

    // Check if user is owner or admin of the group
    const { data: membership } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single()

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json(
        { error: 'Only owners and admins can add members' },
        { status: 403 }
      )
    }

    // Get group info
    const { data: group } = await supabaseAdmin
      .from('conversations')
      .select('name, max_members')
      .eq('id', groupId)
      .single()

    // Check current member count
    const { count: currentMembers } = await supabaseAdmin
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)

    const maxMembers = group?.max_members || 100
    if (currentMembers && currentMembers + memberIds.length > maxMembers) {
      return NextResponse.json(
        { error: `Group is full. Maximum ${maxMembers} members allowed.` },
        { status: 400 }
      )
    }

    // Add members (filter out existing members)
    const existingMembers = await supabaseAdmin
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .in('user_id', memberIds)

    const existingIds = existingMembers.data?.map((m) => m.user_id) || []
    const newMemberIds = memberIds.filter((id: string) => !existingIds.includes(id))

    if (newMemberIds.length === 0) {
      return NextResponse.json({ message: 'All users are already members' })
    }

    const memberInserts = newMemberIds.map((memberId: string) => ({
      group_id: groupId,
      user_id: memberId,
      role: 'member' as const,
    }))

    const { error: insertError } = await supabaseAdmin
      .from('group_members')
      .insert(memberInserts)

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    // Create notifications for new members
    for (const memberId of newMemberIds) {
      await supabaseAdmin.from('notifications').insert({
        user_id: memberId,
        type: 'system',
        title: '加入群组',
        content: `您已被添加到群组 "${group?.name || '未知群组'}"`,
        related_id: groupId,
        related_type: 'user',
        link: `/groups/${groupId}`,
      })
    }

    return NextResponse.json({ success: true, addedCount: newMemberIds.length })
  } catch (error: any) {
    console.error('Add group members error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add members' },
      { status: 500 }
    )
  }
}

/**
 * Remove members from a group
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const groupId = params.id
    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID required' },
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

    // Check if user is owner or admin of the group, or if removing themselves
    const { data: membership } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single()

    const { data: targetMember } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', memberId)
      .single()

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this group' },
        { status: 403 }
      )
    }

    // Can't remove owner
    if (targetMember?.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove group owner' },
        { status: 400 }
      )
    }

    // Only owner/admins can remove others, or users can remove themselves
    if (memberId !== user.id && membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can remove members' },
        { status: 403 }
      )
    }

    // Remove member
    const { error: deleteError } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', memberId)

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Remove group member error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove member' },
      { status: 500 }
    )
  }
}
