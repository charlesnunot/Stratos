/**
 * 审计日志（支付/财务/账户操作）
 * 记录操作人、资源、操作类型、结果，不记录密码、密钥、account_info 等敏感内容
 * 同时写入控制台与 audit_log 表，便于检索与合规
 */

export interface AuditEntry {
  action: string
  userId?: string
  resourceId?: string
  resourceType?: string
  result: 'success' | 'fail' | 'forbidden'
  timestamp: string
  meta?: Record<string, unknown>
}

/**
 * 持久化到 audit_log 表（异步，不阻塞调用方）
 */
async function persistAudit(entry: AuditEntry): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const admin = await getSupabaseAdmin()
    await admin
      .from('audit_log')
      .insert({
        action: entry.action,
        user_id: entry.userId ?? null,
        resource_id: entry.resourceId ?? null,
        resource_type: entry.resourceType ?? null,
        result: entry.result,
        meta: entry.meta ?? null,
        created_at: entry.timestamp || new Date().toISOString(),
      })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[AUDIT] persist failed', err)
    }
  }
}

/**
 * 记录审计日志（控制台 + audit_log 表，便于检索与合规）
 */
export function logAudit(entry: AuditEntry): void {
  const payload = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  }
  const level = entry.result === 'fail' || entry.result === 'forbidden' ? 'warn' : 'info'
  console.log(`[AUDIT ${level.toUpperCase()}]`, JSON.stringify(payload))
  void persistAudit(payload as AuditEntry)
}
