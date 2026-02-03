/**
 * Admin content approval API
 * Approves posts, products, or comments. Updates status, notifies author, triggers AI, logAudit.
 * Note: Image migration must be done by caller before approval.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

type ContentType = 'post' | 'product' | 'comment' | 'product_comment'

const STATUS_MAP: Record<ContentType, string> = {
  post: 'approved',
  product: 'active',
  comment: 'approved',
  product_comment: 'approved',
}

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
    const statusValue = STATUS_MAP[type]

    const selectFields = type === 'post'
      ? 'id, status, post_type, content'
      : 'id, status'
    const { data: row, error: fetchError } = await admin
      .from(table)
      .select(selectFields)
      .eq('id', id)
      .single()

    if (fetchError || !row) {
      return NextResponse.json({ error: `${type} not found` }, { status: 404 })
    }

    const rowWithStatus = row as unknown as { id: string; status: string }
    // 允许对 pending 审核通过，或对已驳回/下架内容恢复（rejected→approved/active）
    const allowedFrom: Record<ContentType, string[]> = {
      post: ['pending', 'rejected'],
      product: ['pending', 'rejected'],
      comment: ['pending', 'rejected'],
      product_comment: ['pending', 'rejected'],
    }
    if (!allowedFrom[type].includes(rowWithStatus.status)) {
      return NextResponse.json(
        { error: `${type} with status "${rowWithStatus.status}" cannot be approved` },
        { status: 400 }
      )
    }

    const updatePayload: Record<string, unknown> = {
      status: statusValue,
    }
    if (type === 'post' || type === 'product') {
      updatePayload.reviewed_by = user.id
      updatePayload.reviewed_at = new Date().toISOString()
    }
    // product_comment / comment 无 reviewed_by 字段，仅更新 status

    const { error: updateError } = await admin
      .from(table)
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      logAudit({
        action: 'content_review_approve',
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

    logAudit({
      action: 'content_review_approve',
      userId: user.id,
      resourceId: id,
      resourceType: type,
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    // Notify content author (post/product/comment/product_comment owner)
    const ownerIdField = type === 'product' ? 'seller_id' : 'user_id'
    const ownerSelectFields = type === 'product_comment' ? `id, user_id, product_id` : `id, ${ownerIdField}`
    const { data: contentRow } = await admin
      .from(table)
      .select(ownerSelectFields)
      .eq('id', id)
      .single()
    if (contentRow) {
      const row = contentRow as unknown as { seller_id?: string; user_id?: string; product_id?: string }
      const ownerId = type === 'product' ? row.seller_id : row.user_id
      if (ownerId) {
        const link =
          type === 'product' ? `/seller/products/${id}` :
          type === 'post' ? `/post/${id}` :
          type === 'product_comment' && row.product_id
            ? `/product/${row.product_id}`
            : undefined
        try {
          await admin.from('notifications').insert({
            user_id: ownerId,
            type: 'system',
            title: 'Content Approved',
            content: `Your ${type} has been approved`,
            related_id: id,
            related_type: type,
            link,
            actor_id: user.id,
            content_key: 'content_approved',
            content_params: { type },
          })
        } catch (notifErr) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[content-review/approve] notification failed:', notifErr)
          }
        }
      }
      // 商品讨论审核通过：额外通知商品卖家（若卖家不是讨论者本人）
      if (type === 'product_comment') {
        const productId = (contentRow as { product_id?: string }).product_id
        const discussionAuthorId = (contentRow as { user_id?: string }).user_id
        if (productId && discussionAuthorId) {
          const { data: productRow } = await admin
            .from('products')
            .select('seller_id')
            .eq('id', productId)
            .single()
          const sellerId = productRow?.seller_id
          if (sellerId && sellerId !== discussionAuthorId) {
            try {
              await admin.from('notifications').insert({
                user_id: sellerId,
                type: 'system',
                title: 'Product discussion',
                content: 'Someone left a discussion on your product (approved)',
                related_id: id,
                related_type: type,
                link: `/product/${productId}`,
                actor_id: user.id,
                content_key: 'product_discussion_approved_seller',
                content_params: { productId },
              })
            } catch (notifErr) {
              if (process.env.NODE_ENV === 'development') {
                console.error('[content-review/approve] seller notification failed:', notifErr)
              }
            }
          }
        }
      }
    }

    // Trigger AI translation and topic extraction after approval (async, non-blocking)
    if (type === 'post') {
      const postRow = row as { post_type?: string; content?: string | null }
      const postType = postRow.post_type ?? 'normal'
      const hasText = (postRow.content ?? '').trim().length > 0
      const textBasedTypes = ['normal', 'image', 'text', 'story', 'series', 'affiliate']

      // Translate: 有正文或标题/简介的类型都可翻译
      fetch(`${request.nextUrl.origin}/api/ai/translate-after-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ type: 'post', id }),
      }).catch((err) => {
        console.error('[approve] translate-after-publish failed for post:', id, err)
        logAudit({
          action: 'ai_translate_post',
          userId: user.id,
          resourceId: id,
          resourceType: 'post',
          result: 'fail',
          timestamp: new Date().toISOString(),
          meta: { reason: err.message || 'Translation service failed' },
        })
      })

      // Extract topics: 仅对有主文案的类型调用，避免对纯音乐/短视频无效调用
      if (hasText || textBasedTypes.includes(postType)) {
        fetch(`${request.nextUrl.origin}/api/ai/extract-topics-after-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
          body: JSON.stringify({ postId: id }),
        }).catch((err) => {
          console.error('[approve] extract-topics failed for post:', id, err)
          logAudit({
            action: 'ai_extract_topics',
            userId: user.id,
            resourceId: id,
            resourceType: 'post',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { reason: err.message || 'Topic extraction service failed' },
          })
        })
      }
    } else if (type === 'product') {
      // Translate product content
      fetch(`${request.nextUrl.origin}/api/ai/translate-after-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ type: 'product', id }),
      }).catch((err) => {
        console.error('[approve] translate-after-publish failed for product:', id, err)
        logAudit({
          action: 'ai_translate_product',
          userId: user.id,
          resourceId: id,
          resourceType: 'product',
          result: 'fail',
          timestamp: new Date().toISOString(),
          meta: { reason: err.message || 'Translation service failed' },
        })
      })
    } else if (type === 'comment') {
      // Translate comment content
      fetch(`${request.nextUrl.origin}/api/ai/translate-after-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ type: 'comment', id }),
      }).catch((err) => {
        console.error('[approve] translate-after-publish failed for comment:', id, err)
        logAudit({
          action: 'ai_translate_comment',
          userId: user.id,
          resourceId: id,
          resourceType: 'comment',
          result: 'fail',
          timestamp: new Date().toISOString(),
          meta: { reason: err.message || 'Translation service failed' },
        })
      })
    } else if (type === 'product_comment') {
      // Translate product comment (discussion) content
      fetch(`${request.nextUrl.origin}/api/ai/translate-after-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ type: 'product_comment', id }),
      }).catch((err) => {
        console.error('[approve] translate-after-publish failed for product_comment:', id, err)
        logAudit({
          action: 'ai_translate_product_comment',
          userId: user.id,
          resourceId: id,
          resourceType: 'product_comment',
          result: 'fail',
          timestamp: new Date().toISOString(),
          meta: { reason: err.message || 'Translation service failed' },
        })
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[content-review/approve]', e)
    logAudit({
      action: 'content_review_approve',
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
