/**
 * 商品讨论审核通过后：将讨论图片从 Supabase Storage 迁移到 Cloudinary，
 * 更新 product_comments.image_urls，并删除 Supabase 中的原图。
 * 仅允许 admin/support 调用。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const SUPABASE_BUCKET = 'post-images'
const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/' + SUPABASE_BUCKET + '/'
const CLOUDINARY_FOLDER = 'product-comments'

function isSupabaseImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return (
    url.includes('supabase.co') &&
    url.includes(SUPABASE_PUBLIC_PREFIX)
  )
}

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
  folder: string,
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

  let body: { productCommentId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const productCommentId = body?.productCommentId
  if (!productCommentId || typeof productCommentId !== 'string') {
    return NextResponse.json({ error: 'Missing productCommentId' }, { status: 400 })
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
    console.warn('[migrate-product-comment-images] Cloudinary not configured', { missing })
    return NextResponse.json(
      { ok: false, error: `Cloudinary 未配置，请在 .env.local 中设置：${missing.join('、')}` },
      { status: 503 }
    )
  }

  const admin = await getSupabaseAdmin()

  const { data: row, error: fetchError } = await admin
    .from('product_comments')
    .select('id, image_urls')
    .eq('id', productCommentId)
    .single()

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Product comment not found' }, { status: 404 })
  }

  const urls = (row.image_urls ?? []) as string[]
  if (urls.length === 0) {
    return NextResponse.json({ ok: true, migrated: 0, reason: 'no_images' })
  }

  const supabaseCount = urls.filter(isSupabaseImageUrl).length
  if (supabaseCount === 0) {
    console.warn('[migrate-product-comment-images] product comment has image_urls but none are Supabase storage URLs', {
      productCommentId,
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
    if (!isSupabaseImageUrl(oldUrl)) {
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
        console.error('[migrate-product-comment-images] fetch Supabase image failed', {
          productCommentId,
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
        CLOUDINARY_FOLDER,
        contentType
      )
      newUrls.push(cloudinaryUrl)
      pathsToDelete.push(path)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ url: oldUrl, reason })
      console.error('[migrate-product-comment-images] single image failed', { productCommentId, url: oldUrl, reason })
    }
  }

  if (failed.length > 0) {
    const firstReason = failed[0]?.reason ?? ''
    const message = `商品讨论图片迁移失败 ${failed.length}/${supabaseCount} 张${firstReason ? '：' + firstReason : ''}。请稍后重试。`
    console.error('[migrate-product-comment-images] migration failed', { productCommentId, failedCount: failed.length, failed })
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
    .from('product_comments')
    .update({ image_urls: newUrls })
    .eq('id', productCommentId)

  if (updateError) {
    console.error('[migrate-product-comment-images] update product_comments failed', { productCommentId, error: updateError.message })
    return NextResponse.json(
      { ok: false, error: 'Failed to update product_comments.image_urls: ' + updateError.message },
      { status: 500 }
    )
  }

  if (pathsToDelete.length > 0) {
    const { error: deleteError } = await admin.storage
      .from(SUPABASE_BUCKET)
      .remove(pathsToDelete)
    if (deleteError) {
      console.error('[migrate-product-comment-images] Supabase storage remove failed (product comment already updated)', {
        productCommentId,
        error: deleteError.message,
      })
    }
  }

  console.log('[migrate-product-comment-images] success', { productCommentId, migrated: pathsToDelete.length })
  return NextResponse.json({
    ok: true,
    migrated: pathsToDelete.length,
  })
}
