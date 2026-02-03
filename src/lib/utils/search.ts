/**
 * 搜索查询安全处理：防 LIKE 通配符注入、长度限制
 * 用于帖子/商品/用户搜索的输入，不记录敏感信息
 */

const MAX_SEARCH_QUERY_LENGTH = 100

/**
 * 转义 LIKE/ILIKE 中的通配符 % 和 _，避免用户输入改变匹配语义
 * PostgreSQL 默认转义符为 \，故将 \ -> \\, % -> \%, _ -> \_
 */
export function escapeForLike(value: string): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

/**
 * 规范化搜索关键词：trim、截断长度、转义 LIKE 通配符
 * 返回空字符串表示无效输入（可跳过搜索）
 */
export function sanitizeSearchQuery(raw: string): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const truncated = trimmed.length > MAX_SEARCH_QUERY_LENGTH
    ? trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH)
    : trimmed
  return escapeForLike(truncated)
}

const MAX_TOPIC_PARAM_LENGTH = 100

/**
 * 校验话题 URL 参数：长度限制、去除控制字符，避免异常查询
 */
export function validateTopicParam(raw: string): string {
  if (typeof raw !== 'string') return ''
  const decoded = raw.trim()
  if (!decoded) return ''
  const truncated = decoded.length > MAX_TOPIC_PARAM_LENGTH
    ? decoded.slice(0, MAX_TOPIC_PARAM_LENGTH)
    : decoded
  // 去除控制字符
  return truncated.replace(/[\x00-\x1f\x7f]/g, '')
}
