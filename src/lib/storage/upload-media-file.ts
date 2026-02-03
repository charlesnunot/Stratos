/**
 * 上传单个媒体文件（音乐/短视频）到 Supabase Storage
 * 使用独立 bucket：music、short-videos（见迁移 226_storage_music_and_short_videos_buckets.sql）
 * 若未创建上述 bucket，可在 Dashboard 创建，或临时改为使用 posts bucket（路径 userId/music/、userId/videos/）
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_MUSIC_SIZE_MB = 20
export const MAX_VIDEO_SIZE_MB = 100
export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
]
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

const BUCKET_MUSIC = 'music'
const BUCKET_VIDEOS = 'short-videos'

export interface UploadMediaOptions {
  maxSizeMb: number
  allowedTypes: string[]
}

export function validateMediaFile(
  file: File,
  options: UploadMediaOptions
): { ok: true } | { ok: false; message: string } {
  if (!options.allowedTypes.includes(file.type)) {
    return {
      ok: false,
      message: `不支持的文件格式（支持：${options.allowedTypes.join(', ')}）`,
    }
  }
  const maxBytes = options.maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `文件超过 ${options.maxSizeMb}MB 限制`,
    }
  }
  return { ok: true }
}

/**
 * 上传单个媒体文件到对应 bucket：音乐 -> music，短视频 -> short-videos
 * 路径：{userId}/{timestamp}-{random}.{ext}（RLS 要求第一段为 userId）
 * @returns 公开访问 URL
 */
export async function uploadMediaFile(
  supabase: SupabaseClient,
  userId: string,
  subfolder: 'music' | 'videos',
  file: File,
  options: UploadMediaOptions
): Promise<string> {
  const validation = validateMediaFile(file, options)
  if (!validation.ok) {
    throw new Error(validation.message)
  }

  const bucket = subfolder === 'music' ? BUCKET_MUSIC : BUCKET_VIDEOS
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
  const path = `${userId}/${fileName}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
