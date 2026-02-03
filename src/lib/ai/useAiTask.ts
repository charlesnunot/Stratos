'use client'

import { useState, useCallback } from 'react'

const API_URL = '/api/ai/complete'
/** 翻译/推理可能较慢，适当放宽超时并支持重试 */
const TIMEOUT_MS = 20000
const MAX_RETRIES = 1

export type AiTaskType =
  | 'extract_topics'
  | 'translate_comment'
  | 'translate_post'
  | 'translate_product'
  | 'suggest_category'
  | 'translate_message'

export interface RunTaskParams {
  task: AiTaskType
  input: string
  targetLanguage?: string
  maxTokens?: number
}

export interface RunTaskResult {
  result?: string
  topics?: string[]
}

const cache = new Map<string, RunTaskResult>()
const CACHE_TTL_MS = 60_000

function cacheKey(task: string, input: string, targetLanguage?: string): string {
  return `${task}\n${targetLanguage ?? ''}\n${input.length}\n${input}`
}

export function useAiTask() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTask = useCallback(
    async (params: RunTaskParams): Promise<RunTaskResult> => {
      const { task, input, targetLanguage, maxTokens } = params
      const trimmed = input.trim()
      if (!trimmed) {
        return {}
      }

      const key = cacheKey(task, trimmed, targetLanguage)
      const cached = cache.get(key)
      if (cached) {
        return cached
      }

      setLoading(true)
      setError(null)
      let lastError: Error | null = null
      try {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const controller = new AbortController()
            const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
            const res = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: trimmed,
                task,
                target_language: targetLanguage,
                max_tokens: maxTokens ?? 1024,
              }),
              signal: controller.signal,
            })
            clearTimeout(id)

            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              const msg = data?.error ?? res.statusText ?? 'Request failed'
              setError(msg)
              if (res.status === 429) {
                throw new Error('TRANSLATION_LIMIT')
              }
              throw new Error(msg)
            }

            const result: RunTaskResult = {}
            if (Array.isArray(data.topics)) {
              result.topics = data.topics
            }
            if (typeof data.result === 'string') {
              result.result = data.result
            }
            cache.set(key, result)
            setTimeout(() => cache.delete(key), CACHE_TTL_MS)
            return result
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e))
            const isRetryable =
              lastError.name === 'AbortError' ||
              (lastError.message && (
                lastError.message.includes('fetch') ||
                lastError.message.includes('network') ||
                lastError.message === 'Unknown error'
              ))
            if (attempt < MAX_RETRIES && isRetryable) {
              await new Promise((r) => setTimeout(r, 800))
              continue
            }
            setError(lastError.message)
            throw lastError
          }
        }
        throw lastError ?? new Error('Unknown error')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { runTask, loading, error }
}
