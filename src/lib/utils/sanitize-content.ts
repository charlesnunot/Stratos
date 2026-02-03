/**
 * 内容 sanitize：防 XSS，用于帖子/评论等用户生成内容写入前与展示前
 * 同步版本使用 HTML 转义，不注入脚本/标签
 */

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (m) => HTML_ESCAPE[m])
}

/**
 * 同步 sanitize：移除/转义 HTML 与脚本，用于写入 DB 或安全展示
 * 服务端与客户端均可使用
 */
export function sanitizeContent(content: string): string {
  if (typeof content !== 'string') return ''
  return escapeHtml(content)
}
