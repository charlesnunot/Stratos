/**
 * Shared logic: fetch images from external URLs and upload to Supabase Storage (products bucket).
 * Used by POST /api/seller/upload-images-from-urls and admin migrate-direct-seller-images.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET = 'products'
export const FOLDER = 'products'
export const MAX_URLS = 9
export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
export const FETCH_TIMEOUT_MS = 15000

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'] as const
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

function extFromContentType(contentType: string): string | null {
  const normalized = contentType.split(';')[0].trim().toLowerCase()
  return CONTENT_TYPE_TO_EXT[normalized] ?? null
}

function extFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname
    const match = pathname.match(/\.(jpe?g|png|gif|webp)$/i)
    return match ? match[1].toLowerCase().replace('jpg', 'jpeg') : null
  } catch {
    return null
  }
}

export function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const SUPABASE_PRODUCTS_PUBLIC_PREFIX = '/storage/v1/object/public/products/'

/** Whether the URL is our Supabase products bucket public URL (already stored). */
export function isSupabaseProductImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return (
    url.includes('supabase.co') &&
    url.includes(SUPABASE_PRODUCTS_PUBLIC_PREFIX)
  )
}

/**
 * Fetch each URL, validate type/size, upload to products/{userId}/... and return public URLs.
 * On failure cleans up already-uploaded paths and throws with a message suitable for API response.
 */
export async function uploadImagesFromUrls(
  supabase: SupabaseClient,
  userId: string,
  urls: string[]
): Promise<string[]> {
  const uploadedPaths: string[] = []
  const publicUrls: string[] = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'image/*' },
      })
    } catch (e) {
      clearTimeout(timeoutId)
      const msg = e instanceof Error ? e.message : 'Fetch failed'
      await cleanupStorage(supabase, uploadedPaths)
      throw new Error(`Image ${i + 1}: ${msg}`)
    }
    clearTimeout(timeoutId)

    if (!res.ok) {
      await cleanupStorage(supabase, uploadedPaths)
      throw new Error(`Image ${i + 1}: HTTP ${res.status}`)
    }

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = extFromContentType(contentType) ?? extFromUrl(url)
    if (!ext) {
      await cleanupStorage(supabase, uploadedPaths)
      throw new Error(
        `Image ${i + 1}: unsupported type (expected image/jpeg, image/png, image/gif, image/webp)`
      )
    }
    if (contentType && !ALLOWED_TYPES.includes(contentType as (typeof ALLOWED_TYPES)[number])) {
      await cleanupStorage(supabase, uploadedPaths)
      throw new Error(`Image ${i + 1}: content-type not allowed (expected image/*)`)
    }

    const blob = await res.blob()
    if (blob.size > MAX_FILE_SIZE) {
      await cleanupStorage(supabase, uploadedPaths)
      throw new Error(`Image ${i + 1}: file larger than 5MB`)
    }

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
    const filePath = `${FOLDER}/${userId}/${fileName}`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type || `image/${ext}`,
    })

    if (uploadError) {
      await cleanupStorage(supabase, uploadedPaths)
      throw new Error(`Image ${i + 1}: upload failed — ${uploadError.message}`)
    }

    uploadedPaths.push(filePath)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
    publicUrls.push(data.publicUrl)
  }

  return publicUrls
}

export async function cleanupStorage(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return
  try {
    await supabase.storage.from(BUCKET).remove(paths)
  } catch (err) {
    console.error('Cleanup orphaned uploads:', err)
  }
}
