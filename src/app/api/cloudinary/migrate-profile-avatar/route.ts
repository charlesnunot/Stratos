/**
 * 资料审核通过前：将待审核头像从 Supabase Storage (avatars) 迁移到 Cloudinary，
 * 更新 profile 的 pending_avatar_url（审核通过时会把该值写入 avatar_url）。
 * 仅允许 admin/support 调用。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createHash } from 'crypto'

const SUPABASE_AVATARS_BUCKET = 'avatars'
const SUPABASE_PUBLIC_PREFIX = '/storage/v1/object/public/' + SUPABASE_AVATARS_BUCKET + '/'

function isSupabaseAvatarUrl(url: string): boolean {
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
  folder: string = 'avatars',
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
    const hint = res.status === 401
      ? ' 请确认 .env.local 中 CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET 来自 Cloudinary 控制台（Programmable Media）。'
      : ''
    throw new Error(`Cloudinary upload failed: ${res.status} ${text}${hint}`)
  }
  const data = (await res.json()) as { secure_url?: string }
  if (!data?.secure_url) throw new Error('Cloudinary response missing secure_url')
  return data.secure_url
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { profileId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const profileId = body?.profileId
  if (!profileId || typeof profileId !== 'string') {
    return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  }

  const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME)?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (!cloudName || !apiKey || !apiSecret) {
    const missing = [!cloudName && 'CLOUDINARY_CLOUD_NAME', !apiKey && 'CLOUDINARY_API_KEY', !apiSecret && 'CLOUDINARY_API_SECRET'].filter(Boolean)
    console.warn('[migrate-profile-avatar] Cloudinary not configured', { missing })
    return NextResponse.json(
      { ok: false, error: `Cloudinary 未配置：${missing.join('、')}` },
      { status: 503 }
    )
  }

  const admin = await getSupabaseAdmin()
  const { data: row, error: fetchError } = await admin
    .from('profiles')
    .select('id, pending_avatar_url, profile_status')
    .eq('id', profileId)
    .single()

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (row.profile_status !== 'pending') {
    return NextResponse.json({ ok: true, migrated: 0, reason: 'not_pending' })
  }

  const urlToMigrate = row.pending_avatar_url
  if (!urlToMigrate || !isSupabaseAvatarUrl(urlToMigrate)) {
    return NextResponse.json({
      ok: true,
      migrated: 0,
      reason: urlToMigrate ? 'no_supabase_url' : 'no_avatar',
    })
  }

  const path = getStoragePathFromPublicUrl(urlToMigrate)
  if (!path) {
    return NextResponse.json({ ok: false, error: 'Invalid avatar URL path' }, { status: 400 })
  }

  try {
    const imageRes = await fetch(urlToMigrate, { headers: { 'User-Agent': 'Stratos-Migrate/1' } })
    if (!imageRes.ok) {
      console.error('[migrate-profile-avatar] fetch failed', { profileId, status: imageRes.status })
      return NextResponse.json(
        { ok: false, error: `拉取头像失败: ${imageRes.status}` },
        { status: 500 }
      )
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer())
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
    const cloudinaryUrl = await uploadToCloudinary(buffer, cloudName, apiKey, apiSecret, 'avatars', contentType)

    const { error: updateError } = await admin
      .from('profiles')
      .update({ pending_avatar_url: cloudinaryUrl, updated_at: new Date().toISOString() })
      .eq('id', profileId)

    if (updateError) {
      console.error('[migrate-profile-avatar] update failed', { profileId, error: updateError.message })
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
    }

    const { error: deleteError } = await admin.storage.from(SUPABASE_AVATARS_BUCKET).remove([path])
    if (deleteError) {
      console.warn('[migrate-profile-avatar] Supabase storage remove failed (profile already updated)', { profileId, error: deleteError.message })
    }
    return NextResponse.json({ ok: true, migrated: 1 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[migrate-profile-avatar] error', { profileId, msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
