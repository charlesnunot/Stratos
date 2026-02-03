/**
 * 评论审核通过后：将评论图片从 Supabase Storage 迁移到 Cloudinary，
 * 更新 comments.image_urls，并删除 Supabase 中的原图（仅保留已审核内容到 Cloudinary）。
 * 仅允许 admin/support 调用。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const SUPABASE_COMMENT_BUCKET = 'post-images'
const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/' + SUPABASE_COMMENT_BUCKET + '/'

function isSupabaseCommentImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return (
    url.includes('supabase.co') &&
    url.includes(SUPABASE_PUBLIC_PREFIX)
  )
}

/** 从 Supabase 公开 URL 解析 bucket 内路径 */
function getStoragePathFromPublicUrl(url: string): string | null {
  try {
    const idx = url.indexOf(SUPABASE_PUBLIC_PREFIX)
    if (idx === -1) return null
    const path = url.slice(idx + SUPABASE_PUBLIC_PREFIX.length)
    return decodeURIComponent(path).split('?')[0].trim() || null
  } catch {
    return null
  }
}

function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(sorted + apiSecret).digest('hex')
}

async function uploadToCloudinary(
  buffer: Buffer,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  folder: string = 'comments',
  contentType: string = 'image/jpeg'
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

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: form }
  )
  if (!res.ok) {
    const text = await res.text()
    const hint =
      res.status === 401
        ? ' 请确认 .env.local 中 CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET 来自 Cloudinary 控制台「Dashboard → API Keys」（Programmable Media），不要使用 MediaFlows 等其它产品的密钥；并确认密钥无多余空格或换行。'
        : ''
    throw new Error(`Cloudinary upload failed: ${res.status} ${text}${hint}`)
  }
  const data = (await res.json()) as { secure_url?: string }
  if (!data?.secure_url) throw new Error('Cloudinary response missing secure_url')
  return data.secure_url
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { commentId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const commentId = body?.commentId
  if (!commentId || typeof commentId !== 'string') {
    return NextResponse.json({ error: 'Missing commentId' }, { status: 400 })
  }

  const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME)?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!cloudName || !apiKey || !apiSecret) {
    const missing = [
      !cloudName && 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME 或 CLOUDINARY_CLOUD_NAME',
      !apiKey && 'CLOUDINARY_API_KEY',
      !apiSecret && 'CLOUDINARY_API_SECRET',
    ].filter(Boolean)
    console.warn('[migrate-comment-images] Cloudinary not configured', { missing })
    return NextResponse.json(
      { ok: false, error: `Cloudinary 未配置，请在 .env.local 中设置：${missing.join('、')}` },
      { status: 503 }
    )
  }

  const admin = await getSupabaseAdmin()

  const { data: comment, error: fetchError } = await admin
    .from('comments')
    .select('id, image_urls')
    .eq('id', commentId)
    .single()

  if (fetchError || !comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  const urls = (comment.image_urls ?? []) as string[]
  if (urls.length === 0) {
    return NextResponse.json({ ok: true, migrated: 0, reason: 'no_images' })
  }

  const supabaseCount = urls.filter(isSupabaseCommentImageUrl).length
  if (supabaseCount === 0) {
    console.warn('[migrate-comment-images] comment has image_urls but none are Supabase storage URLs', {
      commentId,
      urlCount: urls.length,
      sampleUrl: urls[0]?.slice(0, 80) + (urls[0] && urls[0].length > 80 ? '...' : ''),
    })
    return NextResponse.json({
      ok: true,
      migrated: 0,
      reason: 'no_supabase_urls',
      hint: '图片链接不是 Supabase 存储格式，可能已迁移或来自其他源',
    })
  }

  const newUrls: string[] = []
  const pathsToDelete: string[] = []
  const failed: { url: string; reason: string }[] = []

  for (const oldUrl of urls) {
    if (!isSupabaseCommentImageUrl(oldUrl)) {
      newUrls.push(oldUrl)
      continue
    }
    const path = getStoragePathFromPublicUrl(oldUrl)
    if (!path) {
      failed.push({ url: oldUrl, reason: 'invalid_path' })
      continue
    }

    try {
      const imageRes = await fetch(oldUrl, { headers: { 'User-Agent': 'Stratos-Migrate/1' } })
      if (!imageRes.ok) {
        const hint403 = imageRes.status === 403
          ? '（请确认 Supabase Storage 中 post-images 桶为公开可读）'
          : ''
        failed.push({
          url: oldUrl,
          reason: `fetch_${imageRes.status}${hint403}`,
        })
        console.error('[migrate-comment-images] fetch Supabase image failed', {
          commentId,
          url: oldUrl.slice(0, 80),
          status: imageRes.status,
        })
        continue
      }
      const buffer = Buffer.from(await imageRes.arrayBuffer())
      const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
      const cloudinaryUrl = await uploadToCloudinary(
        buffer,
        cloudName,
        apiKey,
        apiSecret,
        'comments',
        contentType
      )
      newUrls.push(cloudinaryUrl)
      pathsToDelete.push(path)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ url: oldUrl, reason })
      console.error('[migrate-comment-images] single image failed', { commentId, url: oldUrl, reason })
    }
  }

  if (failed.length > 0) {
    const firstReason = failed[0]?.reason ?? ''
    const message = `评论图片迁移失败 ${failed.length}/${supabaseCount} 张${firstReason ? '：' + firstReason : ''}。请稍后重试。`
    console.error('[migrate-comment-images] migration failed', { commentId, failedCount: failed.length, failed })
    return NextResponse.json(
      {
        ok: false,
        error: message,
        failedCount: failed.length,
        totalSupabase: supabaseCount,
        failedUrls: failed.map((f) => f.url),
        firstReason: failed[0]?.reason,
      },
      { status: 500 }
    )
  }

  const { error: updateError } = await admin
    .from('comments')
    .update({ image_urls: newUrls })
    .eq('id', commentId)

  if (updateError) {
    console.error('[migrate-comment-images] update comment failed', { commentId, error: updateError.message })
    return NextResponse.json(
      { ok: false, error: 'Failed to update comment image_urls: ' + updateError.message },
      { status: 500 }
    )
  }

  if (pathsToDelete.length > 0) {
    const { error: deleteError } = await admin.storage
      .from(SUPABASE_COMMENT_BUCKET)
      .remove(pathsToDelete)
    if (deleteError) {
      console.error('[migrate-comment-images] Supabase storage remove failed (comment already updated)', {
        commentId,
        error: deleteError.message,
      })
    }
  }

  console.log('[migrate-comment-images] success', { commentId, migrated: pathsToDelete.length })
  return NextResponse.json({
    ok: true,
    migrated: pathsToDelete.length,
  })
}
