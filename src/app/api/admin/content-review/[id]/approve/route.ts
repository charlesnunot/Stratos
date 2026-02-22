/**
 * Admin content approval API
 * Approves posts, products, or comments. Updates status, notifies author, triggers AI, logAudit.
 * For products: migrates images to Cloudinary before approval.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { createHash } from 'crypto'

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

const SUPABASE_PUBLIC_PATTERN = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

function parseSupabasePublicUrl(url: string): { bucket: string; path: string } | null {
  if (!url || typeof url !== 'string') return null
  const m = url.trim().match(SUPABASE_PUBLIC_PATTERN)
  if (!m) return null
  const bucket = decodeURIComponent(m[1])
  const path = decodeURIComponent(m[2]).split('?')[0].trim()
  return path ? { bucket, path } : null
}

function isSupabaseStorageUrl(url: string): boolean {
  return !!url && url.includes('supabase.co') && !!parseSupabasePublicUrl(url)
}

function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(sorted + apiSecret).digest('hex')
}

async function uploadImageToCloudinary(
  buffer: Buffer,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  folder: string,
  contentType: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const params: Record<string, string> = { folder, timestamp }
  const signature = cloudinarySignature(params, apiSecret)
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'jpg'
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), `image.${ext}`)
  form.append('api_key', apiKey)
  form.append('timestamp', timestamp)
  form.append('signature', signature)
  form.append('folder', folder)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cloudinary image upload failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { secure_url?: string }
  if (!data?.secure_url) throw new Error('Cloudinary response missing secure_url')
  return data.secure_url
}

async function migrateProductImages(
  admin: any,
  productId: string
): Promise<{ success: boolean; migrated: number; error?: string }> {
  const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME)?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    const missing = [
      !cloudName && 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME 或 CLOUDINARY_CLOUD_NAME',
      !apiKey && 'CLOUDINARY_API_KEY',
      !apiSecret && 'CLOUDINARY_API_SECRET',
    ].filter(Boolean)
    return { success: false, migrated: 0, error: `Cloudinary 未配置，请在 .env.local 中设置：${missing.join('、')}` }
  }

  const { data: product } = await admin
    .from('products')
    .select('id, images, color_options')
    .eq('id', productId)
    .single()

  if (!product) {
    return { success: false, migrated: 0, error: 'Product not found' }
  }

  const images = (product.images ?? []) as string[]
  const colorOptions = (product.color_options ?? []) as Array<{ name: string; image_url: string | null }>

  const supabaseImageUrls = images.filter(isSupabaseStorageUrl)
  
  const colorOptionImageUrls = colorOptions
    .map(opt => opt.image_url)
    .filter((url): url is string => !!url && isSupabaseStorageUrl(url))

  const allSupabaseUrls = [...supabaseImageUrls, ...colorOptionImageUrls]

  if (allSupabaseUrls.length === 0) {
    return { success: true, migrated: 0 }
  }

  const failed: { url: string; reason: string }[] = []
  const toDelete: { bucket: string; path: string }[] = []
  const urlToNewUrl = new Map<string, string>()

  for (const url of allSupabaseUrls) {
    try {
      const parsed = parseSupabasePublicUrl(url)
      if (!parsed) {
        failed.push({ url, reason: 'invalid_supabase_url' })
        continue
      }

      const res = await fetch(url, { headers: { 'User-Agent': 'Stratos-Approve/1' } })
      if (!res.ok) {
        failed.push({ url, reason: `fetch_${res.status}` })
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const cloudinaryUrl = await uploadImageToCloudinary(buffer, cloudName, apiKey, apiSecret, 'products', contentType)

      urlToNewUrl.set(url, cloudinaryUrl)
      toDelete.push({ bucket: parsed.bucket, path: parsed.path })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ url, reason })
    }
  }

  if (failed.length > 0) {
    const firstReason = failed[0]?.reason ?? ''
    return {
      success: false,
      migrated: 0,
      error: `图片迁移失败 ${failed.length}/${allSupabaseUrls.length} 项${firstReason ? '：' + firstReason : ''}`,
    }
  }

  const newImages = images.map((url) => urlToNewUrl.get(url) ?? url)
  
  const newColorOptions = colorOptions.map(opt => ({
    ...opt,
    image_url: opt.image_url ? (urlToNewUrl.get(opt.image_url) ?? opt.image_url) : null,
  }))

  const { error: updateError } = await admin.from('products').update({
    images: newImages,
    color_options: newColorOptions,
    updated_at: new Date().toISOString(),
  }).eq('id', productId)

  if (updateError) {
    return { success: false, migrated: 0, error: 'Failed to update product: ' + updateError.message }
  }

  for (const { bucket, path } of toDelete) {
    const { error: deleteError } = await admin.storage.from(bucket).remove([path])
    if (deleteError) {
      console.error('[approve] Supabase storage remove failed', { productId, bucket, path, error: deleteError.message })
    }
  }

  return { success: true, migrated: toDelete.length }
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
      : type === 'product'
        ? 'id, status, images, category'
        : 'id, status'
    const { data: row, error: fetchError } = await admin
      .from(table)
      .select(selectFields)
      .eq('id', id)
      .single()

    if (fetchError || !row) {
      return NextResponse.json({ error: `${type} not found` }, { status: 404 })
    }

    // For products, check if images are present
    if (type === 'product') {
      const productRow = row as unknown as { id: string; status: string; images: string[] | null; category: string | null }
      const images = productRow.images ?? []
      
      // 检查是否有图片
      if (images.length === 0) {
        return NextResponse.json(
          { error: '商品必须至少包含一张图片才能审核通过' },
          { status: 400 }
        )
      }
      
      // 检查是否所有图片都已迁移（已经是 Cloudinary URL）
      const hasCloudinaryImage = images.some(url => url && url.includes('cloudinary.com'))
      const hasSupabaseImage = images.some(isSupabaseStorageUrl)
      
      // 如果既有 Cloudinary 图片又有 Supabase 图片，或者只有 Cloudinary 图片，说明已迁移
      // 如果只有 Supabase 图片，需要在审核时迁移
      // 这种情况是允许的，不报错
      
      // Check if category is not empty
      if (!productRow.category || !productRow.category.trim()) {
        return NextResponse.json(
          { error: '商品分类为空，无法翻译和审核通过' },
          { status: 400 }
        )
      }
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

    // For products, migrate images to Cloudinary before approval
    if (type === 'product') {
      const migrationResult = await migrateProductImages(admin, id)
      if (!migrationResult.success) {
        return NextResponse.json(
          { error: migrationResult.error || 'Image migration failed' },
          { status: 500 }
        )
      }
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
      try {
        logAudit({
          action: 'content_review_approve',
          userId: user.id,
          resourceId: id,
          resourceType: type,
          result: 'fail',
          timestamp: new Date().toISOString(),
          meta: { reason: updateError.message },
        })
      } catch (_) {
        // ignore audit failure
      }
      return NextResponse.json(
        { error: updateError.message || 'Database update failed' },
        { status: 500 }
      )
    }

    try {
      logAudit({
        action: 'content_review_approve',
        userId: user.id,
        resourceId: id,
        resourceType: type,
        result: 'success',
        timestamp: new Date().toISOString(),
      })
    } catch (_) {
      // do not fail the request if audit logging fails
    }

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
    const message = e instanceof Error ? e.message : String(e)
    console.error('[content-review/approve]', e)
    try {
      logAudit({
        action: 'content_review_approve',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: message },
      })
    } catch (_) {
      // ignore
    }
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? message : 'Internal server error' },
      { status: 500 }
    )
  }
}
