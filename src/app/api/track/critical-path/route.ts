import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * 关键路径性能监控 API
 * 
 * 链路追踪：
 * - 入口：前端发送 critical-fetch header 的请求
 * - 处理：记录关键路径名称、执行时间、结果
 * - 日志：记录到 server log（不写 DB，不阻塞用户）
 * 
 * 隐私保护：
 * - 只记录 metaKeys，不记录 meta 原文（避免 PII）
 * - 记录用户 ID 用于追踪（截断显示）
 */
export async function POST(request: NextRequest) {
  const traceId = request.headers.get('x-trace-id') ?? 'unknown'
  const criticalPath = request.headers.get('x-critical-path') ?? 'unknown'

  const body = await request.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name : criticalPath
  const durationMs = typeof body?.durationMs === 'number' ? body.durationMs : null
  const outcome = typeof body?.outcome === 'string' ? body.outcome : 'unknown'

  // 获取用户信息用于追踪（不阻塞）
  let userId: string | undefined
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id
  } catch {
    // 忽略认证错误
  }

  // 最低可用实现：先落到 server log，后续可替换为指标系统（Sentry/Datadog/ClickHouse 等）
  // 关键：不要阻塞用户路径（不写 DB，不做重计算）；不记录 meta 原文，避免 PII 进入日志
  if (process.env.NODE_ENV !== 'test') {
    const metaKeys = body?.meta && typeof body.meta === 'object'
      ? Object.keys(body.meta)
      : null
    console.log('[critical-path]', {
      name,
      traceId,
      outcome,
      durationMs,
      metaKeys,
      userId: userId ? `${userId.substring(0, 8)}...` : undefined,
      timestamp: new Date().toISOString(),
    })
  }

  return NextResponse.json({ ok: true })
}

