/**
 * 生成用于 URL 的规范 ASCII slug：小写、空格变连字符、仅保留 [a-z0-9-]
 * 用于话题等，使中英文页面跳转到同一可读链接（如 /topics/pet-lost）
 */
export function toCanonicalSlug(text: string): string {
  if (!text || typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
