/**
 * 服务端专用：调用 DeepSeek 从文本中提取话题（审核通过后自动生成话题用）。
 */

import { getSystemPrompt } from '@/lib/ai/prompts'
import { fetchDeepSeek } from '@/lib/ai/deepseek-fetch'

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_TIMEOUT_MS = 25_000
const DEFAULT_MODEL = 'deepseek-chat'
const INPUT_MAX_LENGTH = 2000
const DEFAULT_MAX_TOKENS = 256

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

function parseExtractTopics(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
    }
    if (typeof parsed === 'string') {
      return parsed.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
    }
  } catch {
    // not JSON
  }
  return trimmed.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
}

/**
 * 从文本中提取 3～5 个话题关键词。未配置 API Key 或失败时返回 []。
 */
export async function extractTopicsOnServer(content: string): Promise<string[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey || !content?.trim()) return []
  const trimmed = content.trim()
  if (trimmed.length > INPUT_MAX_LENGTH) return []

  const model = process.env.AI_INFERENCE_MODEL?.trim() || DEFAULT_MODEL
  const systemPrompt = getSystemPrompt('extract_topics')
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: trimmed },
  ]

  try {
    const res = await fetchDeepSeek(DEEPSEEK_URL, {
      method: 'POST',
      timeoutMs: DEEPSEEK_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: DEFAULT_MAX_TOKENS,
        temperature: 0.3,
      }),
    })
    const data = (await res.json()) as DeepSeekResponse
    if (!res.ok) return []
    const text = data?.choices?.[0]?.message?.content?.trim() ?? ''
    return parseExtractTopics(text)
  } catch {
    return []
  }
}
