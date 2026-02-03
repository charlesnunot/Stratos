const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_LANGUAGE_SERVICE_URL?.trim()?.replace(/\/+$/, '')
const DEFAULT_TIMEOUT = 3_000 // 3s，宁愿不用也别拖 UI

type TranslateParams = {
  text: string
  source?: 'zh' | 'en'
  target?: 'zh' | 'en'
}

type PolishParams = {
  text: string
  tone?: 'neutral' | 'formal' | 'casual'
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

/**
 * 翻译文本
 * 失败时直接返回原文
 */
export async function translateText(params: TranslateParams): Promise<string> {
  if (!AI_BASE_URL) return params.text

  const from_lang = params.source ?? 'zh'
  const to_lang = params.target ?? 'en'

  try {
    const res = await fetchWithTimeout(`${AI_BASE_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text,
        from_lang,
        to_lang,
      }),
    })
    if (!res.ok) return params.text
    const data = (await res.json()) as { result?: string }
    return typeof data?.result === 'string' && data.result.trim() ? data.result : params.text
  } catch {
    return params.text
  }
}

/**
 * 润色文本
 * 失败时直接返回原文
 */
export async function polishText(params: PolishParams): Promise<string> {
  if (!AI_BASE_URL) return params.text

  try {
    const res = await fetchWithTimeout(`${AI_BASE_URL}/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: params.text }),
    })
    if (!res.ok) return params.text
    const data = (await res.json()) as { result?: string }
    return typeof data?.result === 'string' && data.result.trim() ? data.result : params.text
  } catch {
    return params.text
  }
}
