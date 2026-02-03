import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

/**
 * Add members to a group
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params
    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { memberIds } = await request.json()

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: 'Member IDs required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()

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
      logAudit({
        action: 'group_add_member',
        userId: user.id,
        resourceId: groupId,
        resourceType: 'conversation',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: insertError.message },
      })
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    logAudit({
      action: 'group_add_member',
      userId: user.id,
      resourceId: groupId,
      resourceType: 'conversation',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { addedCount: newMemberIds.length },
    })

    // Create notifications for new members (use content_key for i18n)
    for (const memberId of newMemberIds) {
      await supabaseAdmin.from('notifications').insert({
        user_id: memberId,
        type: 'system',
        title: 'Added to Group',
        content: `You have been added to group "${group?.name || 'Group'}"`,
        related_id: groupId,
        related_type: 'conversation',
        link: `/messages/${groupId}`,
        actor_id: user.id,
        content_key: 'group_joined',
        content_params: { groupName: group?.name || 'Group' },
      })
    }

    return NextResponse.json({ success: true, addedCount: newMemberIds.length })
  } catch (err: unknown) {
    console.error('Add group members error:', err)
    const message = err instanceof Error ? err.message : 'Failed to add members'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Remove members from a group
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params
    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('memberId')

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = await getSupabaseAdmin()

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

    // Get group name for notification
    const { data: groupForNotif } = await supabaseAdmin
      .from('conversations')
      .select('name')
      .eq('id', groupId)
      .single()

    // Remove member
    const { error: deleteError } = await supabaseAdmin
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', memberId)

    if (deleteError) {
      logAudit({
        action: 'group_remove_member',
        userId: user.id,
        resourceId: groupId,
        resourceType: 'conversation',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: deleteError.message },
      })
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      )
    }

    logAudit({
      action: 'group_remove_member',
      userId: user.id,
      resourceId: groupId,
      resourceType: 'conversation',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { removedMemberId: memberId },
    })

    // Notify removed member (use content_key for i18n)
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: memberId,
        type: 'system',
        title: 'Removed from Group',
        content: `You have been removed from group "${groupForNotif?.name || 'Group'}"`,
        related_id: groupId,
        related_type: 'conversation',
        link: '/messages',
        actor_id: user.id,
        content_key: 'group_member_removed',
        content_params: { groupName: groupForNotif?.name || 'Group' },
      })
    } catch (notifErr) {
      console.error('[groups/members] Failed to send removal notification:', notifErr)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('Remove group member error:', err)
    const message = err instanceof Error ? err.message : 'Failed to remove member'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
