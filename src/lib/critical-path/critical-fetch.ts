type CriticalPathOutcome = 'success' | 'timeout' | 'failed' | 'aborted'

function getOrCreateTraceId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    const key = 'cp_trace_id'
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    window.sessionStorage.setItem(key, id)
    return id
  } catch {
    return 'client'
  }
}

async function trackCriticalPathEvent(params: {
  name: string
  traceId: string
  durationMs: number
  outcome: CriticalPathOutcome
  meta?: Record<string, unknown>
}) {
  // fire-and-forget: 关键路径不应因为埋点失败而变慢或阻断
  try {
    fetch('/api/track/critical-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ignore
  }
}

export class CriticalPathTimeoutError extends Error {
  override name = 'CriticalPathTimeoutError'
  constructor(message = '请求超时') {
    super(message)
  }
}

function isAbortLikeError(err: any) {
  const name = err?.name || ''
  const message = String(err?.message || '')
  return name === 'AbortError' || message.includes('aborted') || message.includes('cancelled') || message.includes('signal is aborted')
}

/**
 * 关键路径请求封装（强制使用）：
 * - 统一超时（默认 8s）
 * - 统一 traceId（同一次会话内复用）
 * - 统一 outcome 埋点（success/timeout/failed/aborted）
 */
export async function criticalFetch<T = unknown>(
  name: string,
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number; trackMeta?: Record<string, unknown> }
): Promise<{ data: T; traceId: string; durationMs: number }> {
  const timeoutMs = init?.timeoutMs ?? 8000
  const traceId = getOrCreateTraceId()
  const start = performance.now()

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const headers = new Headers(init?.headers)
    headers.set('x-critical-path', name)
    headers.set('x-trace-id', traceId)
    headers.set('x-timeout-ms', String(timeoutMs))

    const res = await fetch(input, {
      ...init,
      headers,
      signal: controller.signal,
    })

    const durationMs = Math.round(performance.now() - start)

    const contentType = res.headers.get('content-type') || ''
    const payload: any = contentType.includes('application/json') ? await res.json().catch(() => ({})) : await res.text()

    if (!res.ok) {
      await trackCriticalPathEvent({
        name,
        traceId,
        durationMs,
        outcome: 'failed',
        meta: { status: res.status, ...(init?.trackMeta ?? {}) },
      })
      const message = typeof payload?.message === 'string' ? payload.message : '请求失败'
      throw new Error(message)
    }

    await trackCriticalPathEvent({
      name,
      traceId,
      durationMs,
      outcome: 'success',
      meta: init?.trackMeta,
    })

    return { data: payload as T, traceId, durationMs }
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start)

    if (isAbortLikeError(err)) {
      await trackCriticalPathEvent({
        name,
        traceId,
        durationMs,
        outcome: durationMs >= timeoutMs ? 'timeout' : 'aborted',
        meta: init?.trackMeta,
      })
      if (durationMs >= timeoutMs) throw new CriticalPathTimeoutError('验证超时，请重试')
      throw err
    }

    await trackCriticalPathEvent({
      name,
      traceId,
      durationMs,
      outcome: 'failed',
      meta: init?.trackMeta,
    })
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

