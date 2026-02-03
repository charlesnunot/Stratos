/**
 * 帖子审核通过前：将帖子媒体从 Supabase Storage 迁移到 Cloudinary。
 * 支持 image_urls（posts 桶）、cover_url（图）、music_url（music 桶）、video_url（short-videos 桶）。
 * 更新 posts 对应字段并删除 Supabase 中的原文件。仅允许 admin/support 调用。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const BUCKETS = { posts: 'posts', music: 'music', shortVideos: 'short-videos' } as const
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

/** 将音/视频 buffer 上传到 Cloudinary Video API，返回 secure_url */
async function uploadVideoToCloudinary(
  buffer: Buffer,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
  folder: string,
  contentType: string,
  filename: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const params: Record<string, string> = { folder, timestamp }
  const signature = cloudinarySignature(params, apiSecret)
  const ext = filename.split('.').pop() || (contentType.includes('mp4') ? 'mp4' : contentType.includes('webm') ? 'webm' : contentType.includes('mp3') ? 'mp3' : 'mp4')
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), `media.${ext}`)
  form.append('api_key', apiKey)
  form.append('timestamp', timestamp)
  form.append('signature', signature)
  form.append('folder', folder)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text()
    const hint = res.status === 401 ? ' 请确认 .env.local 中 CLOUDINARY 密钥来自 Programmable Media。' : ''
    throw new Error(`Cloudinary video upload failed: ${res.status} ${text}${hint}`)
  }
  const data = (await res.json()) as { secure_url?: string }
  if (!data?.secure_url) throw new Error('Cloudinary response missing secure_url')
  return data.secure_url
}

type MigrationItem = {
  url: string
  bucket: string
  path: string
  kind: 'image' | 'video'
  folder: string
}

function collectMigrationItems(post: {
  image_urls?: string[] | null
  cover_url?: string | null
  music_url?: string | null
  video_url?: string | null
}): MigrationItem[] {
  const items: MigrationItem[] = []
  const imageUrls = (post.image_urls ?? []) as string[]

  for (const url of imageUrls) {
    const parsed = parseSupabasePublicUrl(url)
    if (parsed && parsed.bucket === BUCKETS.posts) {
      items.push({ url, bucket: parsed.bucket, path: parsed.path, kind: 'image', folder: 'posts' })
    }
  }

  if (post.cover_url && isSupabaseStorageUrl(post.cover_url)) {
    const parsed = parseSupabasePublicUrl(post.cover_url)
    if (parsed) items.push({ url: post.cover_url, bucket: parsed.bucket, path: parsed.path, kind: 'image', folder: 'posts/covers' })
  }

  if (post.music_url && isSupabaseStorageUrl(post.music_url)) {
    const parsed = parseSupabasePublicUrl(post.music_url)
    if (parsed && parsed.bucket === BUCKETS.music) {
      items.push({ url: post.music_url, bucket: parsed.bucket, path: parsed.path, kind: 'video', folder: 'posts/music' })
    }
  }

  if (post.video_url && isSupabaseStorageUrl(post.video_url)) {
    const parsed = parseSupabasePublicUrl(post.video_url)
    if (parsed && parsed.bucket === BUCKETS.shortVideos) {
      items.push({ url: post.video_url, bucket: parsed.bucket, path: parsed.path, kind: 'video', folder: 'posts/short-videos' })
    }
  }

  return items
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

  let body: { postId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const postId = body?.postId
  if (!postId || typeof postId !== 'string') {
    return NextResponse.json({ error: 'Missing postId' }, { status: 400 })
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
    console.warn('[migrate-post-media] Cloudinary not configured', { missing })
    return NextResponse.json(
      { ok: false, error: `Cloudinary 未配置，请在 .env.local 中设置：${missing.join('、')}` },
      { status: 503 }
    )
  }

  const admin = await getSupabaseAdmin()

  const { data: post, error: fetchError } = await admin
    .from('posts')
    .select('id, image_urls, cover_url, music_url, video_url')
    .eq('id', postId)
    .single()

  if (fetchError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const items = collectMigrationItems(post)

  if (items.length === 0) {
    return NextResponse.json({ ok: true, migrated: 0, reason: 'no_supabase_media' })
  }

  const failed: { url: string; reason: string }[] = []
  const toDelete: { bucket: string; path: string }[] = []
  const urlToNewUrl = new Map<string, string>()

  for (const item of items) {
    try {
      const res = await fetch(item.url, { headers: { 'User-Agent': 'Stratos-Migrate/1' } })
      if (!res.ok) {
        failed.push({ url: item.url, reason: `fetch_${res.status}` })
        console.error('[migrate-post-media] fetch failed', { postId, url: item.url.slice(0, 80), status: res.status })
        continue
      }
      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || (item.kind === 'image' ? 'image/jpeg' : 'video/mp4')
      const cloudinaryUrl =
        item.kind === 'image'
          ? await uploadImageToCloudinary(buffer, cloudName, apiKey, apiSecret, item.folder, contentType)
          : await uploadVideoToCloudinary(buffer, cloudName, apiKey, apiSecret, item.folder, contentType, item.path)

      urlToNewUrl.set(item.url, cloudinaryUrl)
      toDelete.push({ bucket: item.bucket, path: item.path })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ url: item.url, reason })
      console.error('[migrate-post-media] single migration failed', { postId, url: item.url.slice(0, 80), reason })
    }
  }

  if (failed.length > 0) {
    const firstReason = failed[0]?.reason ?? ''
    const message = `媒体迁移失败 ${failed.length}/${items.length} 项${firstReason ? '：' + firstReason : ''}。请稍后重试。`
    console.error('[migrate-post-media] migration failed', { postId, failedCount: failed.length, failed })
    return NextResponse.json(
      {
        ok: false,
        error: message,
        failedCount: failed.length,
        total: items.length,
        firstReason: failed[0]?.reason,
      },
      { status: 500 }
    )
  }

  const imageUrls = (post.image_urls ?? []) as string[]
  const newImageUrls = imageUrls.map((url) => urlToNewUrl.get(url) ?? url)
  const newCoverUrl = post.cover_url ? (urlToNewUrl.get(post.cover_url) ?? post.cover_url) : null
  const newMusicUrl = post.music_url ? (urlToNewUrl.get(post.music_url) ?? post.music_url) : null
  const newVideoUrl = post.video_url ? (urlToNewUrl.get(post.video_url) ?? post.video_url) : null

  const updatePayload: Record<string, unknown> = {
    image_urls: newImageUrls,
    cover_url: newCoverUrl,
    music_url: newMusicUrl,
    video_url: newVideoUrl,
  }

  const { error: updateError } = await admin.from('posts').update(updatePayload).eq('id', postId)

  if (updateError) {
    console.error('[migrate-post-media] update post failed', { postId, error: updateError.message })
    return NextResponse.json(
      { ok: false, error: 'Failed to update post: ' + updateError.message },
      { status: 500 }
    )
  }

  for (const { bucket, path } of toDelete) {
    const { error: deleteError } = await admin.storage.from(bucket).remove([path])
    if (deleteError) {
      console.error('[migrate-post-media] Supabase storage remove failed', { postId, bucket, path, error: deleteError.message })
    }
  }

  console.log('[migrate-post-media] success', { postId, migrated: toDelete.length })
  return NextResponse.json({ ok: true, migrated: toDelete.length })
}
