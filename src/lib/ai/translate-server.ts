/**
 * 服务端专用：调用 DeepSeek 做翻译（发布时自动翻译用）。
 * 仅限在 Server Actions / API 路由 / 服务端代码中使用。
 */

import {
  getSystemPrompt,
  type AiTaskType,
} from '@/lib/ai/prompts'
import { fetchDeepSeek } from '@/lib/ai/deepseek-fetch'

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_TIMEOUT_MS = 25_000
const DEFAULT_MODEL = 'deepseek-chat'
const INPUT_MAX_LENGTH = 2000
const DEFAULT_MAX_TOKENS = 1024

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

const TRANSLATE_TASKS: AiTaskType[] = ['translate_post', 'translate_comment', 'translate_product', 'translate_profile']

/**
 * 服务端翻译一段文本到目标语言。未配置 API Key 或失败时返回 null。
 */
export async function translateOnServer(
  input: string,
  targetLanguage: '中文' | 'English',
  task: AiTaskType = 'translate_post'
): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey || !input?.trim()) return null
  const trimmed = input.trim()
  if (trimmed.length > INPUT_MAX_LENGTH) return null
  if (!TRANSLATE_TASKS.includes(task)) return null

  const model = process.env.AI_INFERENCE_MODEL?.trim() || DEFAULT_MODEL
  const messages = [
    { role: 'system' as const, content: getSystemPrompt(task, targetLanguage) },
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
    if (!res.ok) return null
    const text = data?.choices?.[0]?.message?.content?.trim() ?? ''
    return text || null
  } catch {
    return null
  }
}

/** 根据 content_lang 得到目标语言（用于翻译到另一种） */
export function getTargetLanguageForLocale(contentLang: 'zh' | 'en'): '中文' | 'English' {
  return contentLang === 'zh' ? 'English' : '中文'
}
