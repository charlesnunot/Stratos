'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * useRealtime Hook - 稳定版本
 * 
 * ✅ P2: 回调稳定化优化
 * - 使用 useRef 存储 callback，避免因父组件传入内联函数导致频繁重订阅
 * - 只有 table/filter 变化时才会重新订阅，callback 变化不会触发重订阅
 */
export function useRealtime<T>(
  table: string,
  filter: string,
  callback: (payload: T) => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const callbackRef = useRef(callback)
  const supabase = useMemo(() => createClient(), [])

  // 更新 callback ref（不触发 effect 重新执行）
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter,
        },
        (payload) => {
          // 使用 ref 中的最新 callback
          callbackRef.current(payload as T)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [table, filter, supabase]) // callback 不再是依赖项
}
