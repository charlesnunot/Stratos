/**
 * Admin content rejection API
 * Rejects posts, products, or comments. Updates status, notifies author, logAudit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

type ContentType = 'post' | 'product' | 'comment' | 'product_comment'

const TABLE_MAP: Record<ContentType, string> = {
  post: 'posts',
  product: 'products',
  comment: 'comments',
  product_comment: 'product_comments',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAdminOrSupport(request)
    if (!authResult.success) {
      return authResult.response
    }
    const { user } = authResult.data

    let body: { type?: ContentType }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const type = body?.type
    if (!type || !['post', 'product', 'comment', 'product_comment'].includes(type)) {
      return NextResponse.json(
        { error: 'Missing or invalid type. Must be post, product, comment, or product_comment' },
        { status: 400 }
      )
    }

    const admin = await getSupabaseAdmin()
    const table = TABLE_MAP[type]

    const { data: row, error: fetchError } = await admin
      .from(table)
      .select('id, status')
      .eq('id', id)
      .single()

    if (fetchError || !row) {
      return NextResponse.json({ error: `${type} not found` }, { status: 404 })
    }

    // 允许对 pending 驳回，或对已通过内容下架（post/product: approved→rejected, comment/product_comment: approved→rejected）
    const allowedFrom: Record<ContentType, string[]> = {
      post: ['pending', 'approved'],
      product: ['pending', 'active'],
      comment: ['pending', 'approved'],
      product_comment: ['pending', 'approved'],
    }
    if (!allowedFrom[type].includes(row.status)) {
      return NextResponse.json(
        { error: `${type} with status "${row.status}" cannot be rejected` },
        { status: 400 }
      )
    }

    const updatePayload: Record<string, unknown> = {
      status: 'rejected',
    }
    if (type === 'post' || type === 'product') {
      updatePayload.reviewed_by = user.id
      updatePayload.reviewed_at = new Date().toISOString()
    }

    const { error: updateError } = await admin
      .from(table)
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      logAudit({
        action: 'content_review_reject',
        userId: user.id,
        resourceId: id,
        resourceType: type,
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Get content owner for notification
    const ownerIdField = type === 'product' ? 'seller_id' : 'user_id'
    const selectFields = type === 'product_comment' ? `id, user_id, product_id` : `id, ${ownerIdField}`
    const { data: contentRow } = await admin
      .from(table)
      .select(selectFields)
      .eq('id', id)
      .single()

    // Notify content owner about rejection (讨论者/作者收到驳回通知)
    if (contentRow) {
      const ownerId = type === 'product'
        ? (contentRow as { seller_id?: string }).seller_id
        : (contentRow as { user_id?: string }).user_id

      if (ownerId) {
        const contentKeyMap: Record<ContentType, string> = {
          post: 'post_rejected',
          product: 'product_rejected',
          comment: 'comment_rejected',
          product_comment: 'product_comment_rejected',
        }
        const link =
          type === 'product' ? `/seller/products/${id}` :
          type === 'product_comment' && (contentRow as { product_id?: string }).product_id
            ? `/product/${(contentRow as { product_id?: string }).product_id}`
            : `/post/${id}`

        try {
          await admin.from('notifications').insert({
            user_id: ownerId,
            type: 'system',
            title: 'Content Rejected',
            content: `Your ${type} was not approved`,
            related_id: id,
            related_type: type,
            link,
            actor_id: user.id,
            content_key: contentKeyMap[type],
            content_params: {},
          })
        } catch (notifErr) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Content rejection notification failed:', notifErr)
          }
        }
      }
    }

    logAudit({
      action: 'content_review_reject',
      userId: user.id,
      resourceId: id,
      resourceType: type,
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[content-review/reject]', e)
    logAudit({
      action: 'content_review_reject',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: e instanceof Error ? e.message : String(e) },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
