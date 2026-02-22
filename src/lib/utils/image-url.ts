/**
 * 图片 URL 验证工具
 * 用于验证和清洗图片 URL，确保只有有效的 HTTP/HTTPS URL 被使用
 */

/**
 * 验证是否为有效的图片 URL
 * 使用 URL 类进行严格验证，防止脏数据
 */
export function isValidImageUrl(url?: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 从数组中提取有效的图片 URL
 * 过滤掉 null、undefined、空字符串和无效 URL
 */
export function getValidImages(images: unknown): string[] {
  if (!Array.isArray(images)) return []
  return images.filter(isValidImageUrl)
}

/**
 * 获取第一张有效图片
 * 用于封面、缩略图等场景
 */
export function getFirstValidImage(images: unknown): string | null {
  const validImages = getValidImages(images)
  return validImages[0] || null
}
