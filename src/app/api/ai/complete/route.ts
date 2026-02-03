/**
 * AI 推理：Stratos → DeepSeek API → 返回文本
 * 支持 task（extract_topics / translate_* / suggest_category）、target_language、max_tokens。
 * - translate_message：需登录，限频 10 条/人/天。
 * - 其他 task：需登录，限频 50 次/天、5 次/分钟。
 * 请求超时 25s，返回 503；成功/限频/错误均带 X-Request-Id 便于追踪。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { handleApiError } from '@/lib/api/error-handler'
import {
  AI_TASKS,
  getSystemPrompt,
  isTranslationTask,
  type AiTaskType,
} from '@/lib/ai/prompts'
import { fetchDeepSeek } from '@/lib/ai/deepseek-fetch'

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_MODEL = 'deepseek-chat'
const INPUT_MAX_LENGTH = 2000
const DEFAULT_MAX_TOKENS = 1024
const MAX_TOKENS_CAP = 2048
const TRANSLATE_MESSAGE_DAILY_LIMIT = 10
const NON_MESSAGE_DAILY_LIMIT = 50
const NON_MESSAGE_MINUTE_LIMIT = 5
const DEEPSEEK_TIMEOUT_MS = 25_000

function addRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set('X-Request-Id', requestId)
  return res
}

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string; code?: string }
}

type Body = {
  input?: string
  task?: string
  target_language?: string
  max_tokens?: number
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

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) {
    const res = NextResponse.json(
      { error: 'AI inference not configured (missing DEEPSEEK_API_KEY)' },
      { status: 503 }
    )
    return addRequestId(res, requestId)
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    const res = NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    return addRequestId(res, requestId)
  }

  const input = typeof body?.input === 'string' ? body.input.trim() : ''
  if (!input) {
    const res = NextResponse.json({ error: 'Missing or empty "input" in body' }, { status: 400 })
    return addRequestId(res, requestId)
  }
  if (input.length > INPUT_MAX_LENGTH) {
    const res = NextResponse.json(
      { error: `Input exceeds ${INPUT_MAX_LENGTH} characters` },
      { status: 400 }
    )
    return addRequestId(res, requestId)
  }

  const task = body?.task as AiTaskType | undefined
  const targetLanguage = typeof body?.target_language === 'string' ? body.target_language.trim() : undefined
  let maxTokens = typeof body?.max_tokens === 'number' ? body.max_tokens : DEFAULT_MAX_TOKENS
  if (maxTokens < 1 || maxTokens > MAX_TOKENS_CAP) {
    maxTokens = DEFAULT_MAX_TOKENS
  }

  if (task && isTranslationTask(task as AiTaskType) && !targetLanguage) {
    const res = NextResponse.json(
      { error: 'Translation tasks require "target_language" in body' },
      { status: 400 }
    )
    return addRequestId(res, requestId)
  }

  if (!task || !AI_TASKS.includes(task as AiTaskType)) {
    const res = NextResponse.json(
      { error: 'Missing or invalid "task" in body; must be one of: ' + AI_TASKS.join(', ') },
      { status: 400 }
    )
    return addRequestId(res, requestId)
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // 非 translate_message 的 task 必须登录
  if (task && task !== 'translate_message') {
    if (authError || !user) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addRequestId(res, requestId)
    }
    const admin = await getSupabaseAdmin()
    const today = new Date().toISOString().slice(0, 10)
    const minuteTs = Math.floor(Date.now() / 60_000)

    const { data: dailyRow } = await admin
      .from('ai_complete_daily_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle()
    const dailyCount = dailyRow?.count ?? 0
    if (dailyCount >= NON_MESSAGE_DAILY_LIMIT) {
      const res = NextResponse.json(
        {
          error: 'Daily AI usage limit reached',
          code: 'AI_DAILY_LIMIT',
          limit: NON_MESSAGE_DAILY_LIMIT,
        },
        { status: 429 }
      )
      return addRequestId(res, requestId)
    }

    const { data: minuteRow } = await admin
      .from('ai_complete_minute_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('minute_ts', minuteTs)
      .maybeSingle()
    const minuteCount = minuteRow?.count ?? 0
    if (minuteCount >= NON_MESSAGE_MINUTE_LIMIT) {
      const res = NextResponse.json(
        {
          error: 'Too many requests per minute',
          code: 'AI_MINUTE_LIMIT',
          limit: NON_MESSAGE_MINUTE_LIMIT,
        },
        { status: 429 }
      )
      return addRequestId(res, requestId)
    }
  }

  // translate_message: 鉴权 + 限频 10/天
  if (task === 'translate_message') {
    if (authError || !user) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addRequestId(res, requestId)
    }
    const admin = await getSupabaseAdmin()
    const today = new Date().toISOString().slice(0, 10)
    const { data: row } = await admin
      .from('ai_translation_daily_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .eq('task', 'translate_message')
      .maybeSingle()
    const current = row?.count ?? 0
    if (current >= TRANSLATE_MESSAGE_DAILY_LIMIT) {
      const res = NextResponse.json(
        {
          error: 'Daily translation limit reached',
          code: 'TRANSLATION_LIMIT',
          limit: TRANSLATE_MESSAGE_DAILY_LIMIT,
        },
        { status: 429 }
      )
      return addRequestId(res, requestId)
    }
  }

  const model = process.env.AI_INFERENCE_MODEL?.trim() || DEFAULT_MODEL

  const messages: Array<{ role: 'system' | 'user'; content: string }> = []
  if (task && ['extract_topics', 'translate_comment', 'translate_post', 'translate_product', 'suggest_category', 'translate_message'].includes(task)) {
    messages.push({ role: 'system', content: getSystemPrompt(task as AiTaskType, targetLanguage) })
  }
  messages.push({ role: 'user', content: input })

  const startMs = Date.now()

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
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    })

    const data = (await res.json()) as DeepSeekResponse

    if (!res.ok) {
      const msg = data?.error?.message || res.statusText || 'Inference request failed'
      const json = NextResponse.json(
        { error: msg, code: data?.error?.code },
        { status: res.status >= 400 ? res.status : 502 }
      )
      return addRequestId(json, requestId)
    }

    const text = data?.choices?.[0]?.message?.content ?? ''
    const durationMs = Date.now() - startMs

    if (task === 'extract_topics') {
      const topics = parseExtractTopics(text)
      console.info(
        JSON.stringify({
          level: 'info',
          category: 'ai_complete',
          requestId,
          task,
          userId: user?.id ?? 'anonymous',
          inputLength: input.length,
          durationMs,
          rateLimitHit: false,
        })
      )
      return addRequestId(NextResponse.json({ topics }), requestId)
    }

    if (task === 'translate_message' && user) {
      const admin = await getSupabaseAdmin()
      const today = new Date().toISOString().slice(0, 10)
      const { data: row } = await admin
        .from('ai_translation_daily_usage')
        .select('count')
        .eq('user_id', user.id)
        .eq('usage_date', today)
        .maybeSingle()
      if (!row) {
        await admin.from('ai_translation_daily_usage').insert({
          user_id: user.id,
          usage_date: today,
          task: 'translate_message',
          count: 1,
        })
      } else {
        await admin
          .from('ai_translation_daily_usage')
          .update({ count: row.count + 1 })
          .eq('user_id', user.id)
          .eq('usage_date', today)
      }
    }

    if (task && task !== 'translate_message' && user) {
      const admin = await getSupabaseAdmin()
      const today = new Date().toISOString().slice(0, 10)
      const minuteTs = Math.floor(Date.now() / 60_000)
      const { data: dailyRow } = await admin
        .from('ai_complete_daily_usage')
        .select('count')
        .eq('user_id', user.id)
        .eq('usage_date', today)
        .maybeSingle()
      if (!dailyRow) {
        await admin.from('ai_complete_daily_usage').insert({
          user_id: user.id,
          usage_date: today,
          count: 1,
        })
      } else {
        await admin
          .from('ai_complete_daily_usage')
          .update({ count: dailyRow.count + 1 })
          .eq('user_id', user.id)
          .eq('usage_date', today)
      }
      const { data: minuteRow } = await admin
        .from('ai_complete_minute_usage')
        .select('count')
        .eq('user_id', user.id)
        .eq('minute_ts', minuteTs)
        .maybeSingle()
      if (!minuteRow) {
        await admin.from('ai_complete_minute_usage').insert({
          user_id: user.id,
          minute_ts: minuteTs,
          count: 1,
        })
      } else {
        await admin
          .from('ai_complete_minute_usage')
          .update({ count: minuteRow.count + 1 })
          .eq('user_id', user.id)
          .eq('minute_ts', minuteTs)
      }
    }

    const out = NextResponse.json({ result: text })
    addRequestId(out, requestId)
    console.info(
      JSON.stringify({
        level: 'info',
        category: 'ai_complete',
        requestId,
        task: task ?? 'unknown',
        userId: user?.id ?? 'anonymous',
        inputLength: input.length,
        durationMs,
        rateLimitHit: false,
      })
    )
    return out
  } catch (e) {
    const durationMs = Date.now() - startMs
    const isAbort = e instanceof Error && e.name === 'AbortError'
    if (isAbort) {
      const res = NextResponse.json(
        { error: 'AI request timed out', code: 'TIMEOUT' },
        { status: 503 }
      )
      addRequestId(res, requestId)
      console.warn(
        JSON.stringify({
          level: 'warn',
          category: 'ai_complete',
          requestId,
          task: task ?? 'unknown',
          userId: user?.id ?? 'anonymous',
          inputLength: input.length,
          durationMs,
          timeout: true,
        })
      )
      return res
    }
    const res = handleApiError(e, {
      path: request.nextUrl.pathname,
      method: 'POST',
      requestId,
    })
    addRequestId(res, requestId)
    return res
  }
}
