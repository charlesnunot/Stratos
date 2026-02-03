/**
 * Admin API: send report result notifications (resolved / rejected / content_deleted).
 * Uses service role to insert notifications for reporter and/or reported user (RLS only allows own user_id).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'

type Action = 'resolved' | 'rejected' | 'content_deleted'

/** Resolve reported user id from report (reported_type + reported_id) using admin client. */
async function getReportedUserId(
  admin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  report: { reported_type?: string; reported_id?: string }
): Promise<string | null> {
  const type = report.reported_type
  const id = report.reported_id
  if (!type || !id) return null

  switch (type) {
    case 'post': {
      const { data } = await admin.from('posts').select('user_id').eq('id', id).single()
      return data?.user_id ?? null
    }
    case 'product': {
      const { data } = await admin.from('products').select('seller_id').eq('id', id).single()
      return data?.seller_id ?? null
    }
    case 'comment': {
      const { data } = await admin.from('comments').select('user_id').eq('id', id).single()
      return data?.user_id ?? null
    }
    case 'product_comment': {
      const { data } = await admin.from('product_comments').select('user_id').eq('id', id).single()
      return data?.user_id ?? null
    }
    case 'user':
      return id
    case 'order': {
      const { data } = await admin.from('orders').select('buyer_id, seller_id').eq('id', id).single()
      return data?.buyer_id ?? data?.seller_id ?? null
    }
    case 'affiliate_post': {
      const { data } = await admin.from('affiliate_posts').select('affiliate_id, post_id').eq('id', id).single()
      if (data?.post_id) {
        const { data: postData } = await admin.from('posts').select('user_id').eq('id', data.post_id).single()
        return postData?.user_id ?? data?.affiliate_id ?? null
      }
      return data?.affiliate_id ?? null
    }
    case 'tip': {
      const { data } = await admin.from('tips').select('tipper_id, post_id').eq('id', id).single()
      if (data?.post_id) {
        const { data: postData } = await admin.from('posts').select('user_id').eq('id', data.post_id).single()
        return postData?.user_id ?? data?.tipper_id ?? null
      }
      return data?.tipper_id ?? null
    }
    case 'message': {
      const { data } = await admin.from('messages').select('sender_id, conversation_id').eq('id', id).single()
      if (data?.conversation_id) {
        const { data: conv } = await admin.from('conversations').select('participant1_id, participant2_id').eq('id', data.conversation_id).single()
        return conv?.participant1_id === data.sender_id ? conv?.participant2_id ?? null : conv?.participant1_id ?? null
      }
      return data?.sender_id ?? null
    }
    default:
      return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) return authResult.response

    const { id: reportId } = await params
    if (!reportId) {
      return NextResponse.json({ error: 'Report ID required' }, { status: 400 })
    }

    let body: { action?: Action }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const action = body?.action
    if (!action || !['resolved', 'rejected', 'content_deleted'].includes(action)) {
      return NextResponse.json({ error: 'action must be one of: resolved, rejected, content_deleted' }, { status: 400 })
    }

    const adminUserId = authResult.data.user.id
    const admin = await getSupabaseAdmin()
    const { data: report, error: reportError } = await admin
      .from('reports')
      .select('id, reporter_id, reported_type, reported_id')
      .eq('id', reportId)
      .single()

    if (reportError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const reportNo = String(report.id).slice(-8)
    const link = `/admin/reports?reportId=${encodeURIComponent(report.id)}`
    const baseNotif = {
      type: 'report' as const,
      title: '举报处理结果',
      content: null as string | null,
      related_id: report.id,
      related_type: 'report' as const,
      actor_id: adminUserId,
    }

    if (action === 'resolved') {
      await admin.from('notifications').insert({ ...baseNotif, user_id: report.reporter_id, link, content_key: 'report_resolved_closed', content_params: { reportNo } })
      const reportedUserId = await getReportedUserId(admin, report)
      if (reportedUserId) {
        await admin.from('notifications').insert({ ...baseNotif, user_id: reportedUserId, content_key: 'report_resolved_closed', content_params: { reportNo } })
      }
    } else if (action === 'rejected') {
      await admin.from('notifications').insert({ ...baseNotif, user_id: report.reporter_id, link, content_key: 'report_rejected', content_params: { reportNo } })
    } else {
      await admin.from('notifications').insert({ ...baseNotif, user_id: report.reporter_id, link, content_key: 'report_content_deleted_reporter', content_params: { reportNo } })
      const reportedUserId = await getReportedUserId(admin, report)
      if (reportedUserId) {
        await admin.from('notifications').insert({ ...baseNotif, user_id: reportedUserId, content_key: 'report_content_deleted_reported', content_params: { reportNo } })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[admin/reports/send-result-notification] Error:', err)
    const message = err instanceof Error ? err.message : 'Failed to send notifications'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
