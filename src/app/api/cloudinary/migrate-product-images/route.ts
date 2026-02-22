/**
 * 商品审核通过前：将商品图片从 Supabase Storage 迁移到 Cloudinary。
 * 更新 products.images 字段并删除 Supabase 中的原文件。仅允许 admin/support 调用。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

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

/** Cloudinary 签名：参数按 key 排序后 key1=value1&key2=value2，再 sha1(str + api_secret) */
function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(sorted + apiSecret).digest('hex')
}

/** 将图片 buffer 上传到 Cloudinary Image API，返回 secure_url */
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
    const hint = res.status === 401 ? ' 请确认 .env.local 中 CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET 来自 Programmable Media。' : ''
    throw new Error(`Cloudinary image upload failed: ${res.status} ${text}${hint}`)
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

  let body: { productId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const productId = body?.productId
  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 })
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
    console.warn('[migrate-product-images] Cloudinary not configured', { missing })
    return NextResponse.json(
      { ok: false, error: `Cloudinary 未配置，请在 .env.local 中设置：${missing.join('、')}` },
      { status: 503 }
    )
  }

  const admin = await getSupabaseAdmin()

  const { data: product, error: fetchError } = await admin
    .from('products')
    .select('id, images, color_options')
    .eq('id', productId)
    .single()

  if (fetchError || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const images = (product.images ?? []) as string[]
  const supabaseImageUrls = images.filter(isSupabaseStorageUrl)

  const colorOptions = (product.color_options ?? []) as Array<{ name: string; image_url: string | null }>
  const colorOptionImageUrls = colorOptions
    .map(opt => opt.image_url)
    .filter((url): url is string => !!url && isSupabaseStorageUrl(url))

  const allSupabaseUrls = [...supabaseImageUrls, ...colorOptionImageUrls]

  if (allSupabaseUrls.length === 0) {
    return NextResponse.json({ ok: true, migrated: 0, reason: 'no_supabase_images' })
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

      const res = await fetch(url, { headers: { 'User-Agent': 'Stratos-Migrate/1' } })
      if (!res.ok) {
        failed.push({ url, reason: `fetch_${res.status}` })
        console.error('[migrate-product-images] fetch failed', { productId, url: url.slice(0, 80), status: res.status })
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
      console.error('[migrate-product-images] single migration failed', { productId, url: url.slice(0, 80), reason })
    }
  }

  if (failed.length > 0) {
    const firstReason = failed[0]?.reason ?? ''
    const message = `图片迁移失败 ${failed.length}/${supabaseImageUrls.length} 项${firstReason ? '：' + firstReason : ''}。请稍后重试。`
    console.error('[migrate-product-images] migration failed', { productId, failedCount: failed.length, failed })
    return NextResponse.json(
      {
        ok: false,
        error: message,
        failedCount: failed.length,
        total: supabaseImageUrls.length,
        firstReason: failed[0]?.reason,
      },
      { status: 500 }
    )
  }

  const newImages = images.map((url) => urlToNewUrl.get(url) ?? url)
  const newColorOptions = colorOptions.map(opt => ({
    ...opt,
    image_url: opt.image_url ? (urlToNewUrl.get(opt.image_url) ?? opt.image_url) : null,
  }))

  const updatePayload: Record<string, unknown> = {
    images: newImages,
    color_options: newColorOptions,
    updated_at: new Date().toISOString(),
  }

  const { error: updateError } = await admin.from('products').update(updatePayload).eq('id', productId)

  if (updateError) {
    console.error('[migrate-product-images] update product failed', { productId, error: updateError.message })
    return NextResponse.json(
      { ok: false, error: 'Failed to update product: ' + updateError.message },
      { status: 500 }
    )
  }

  for (const { bucket, path } of toDelete) {
    const { error: deleteError } = await admin.storage.from(bucket).remove([path])
    if (deleteError) {
      console.error('[migrate-product-images] Supabase storage remove failed', { productId, bucket, path, error: deleteError.message })
    }
  }

  console.log('[migrate-product-images] success', { productId, migrated: toDelete.length })
  return NextResponse.json({ ok: true, migrated: toDelete.length })
}