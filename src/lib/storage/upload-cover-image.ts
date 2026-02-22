/**
 * 将封面图 Blob 上传到 Supabase Storage posts 桶，用于短视频自动提取的封面等
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET_POSTS = 'posts'

/**
 * 上传封面图 Blob 到 posts 桶
 * @param supabase Supabase 客户端
 * @param userId 用户 ID（路径首段，满足 RLS）
 * @param blob 图片 Blob（如 JPEG）
 * @returns 公开访问 URL
 */
export async function uploadCoverImage(
  supabase: SupabaseClient,
  userId: string,
  blob: Blob
): Promise<string> {
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-cover.jpg`
  const path = `${userId}/${fileName}`

  const { error } = await supabase.storage.from(BUCKET_POSTS).upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
    contentType: 'image/jpeg',
  })

  if (error) throw error

  const { data } = supabase.storage.from(BUCKET_POSTS).getPublicUrl(path)
  return data.publicUrl
}
