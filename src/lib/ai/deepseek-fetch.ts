/**
 * DeepSeek API 请求：带超时，超时返回 null / 抛出以便返回 503
 */

const DEFAULT_TIMEOUT_MS = 25_000

export async function fetchDeepSeek(
  url: string,
  init: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
    })
    clearTimeout(timeoutId)
    return res
  } catch (e) {
    clearTimeout(timeoutId)
    throw e
  }
}
