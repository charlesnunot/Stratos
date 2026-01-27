'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useCartStore } from '@/store/cartStore'
import { usePageVisibility } from './usePageVisibility'
import { createClient } from '@/lib/supabase/client'
import type { ValidationResult } from '@/store/cartStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseCartValidationOptions {
  enabled?: boolean // 是否启用验证
  pollingInterval?: number // 轮询间隔（毫秒，默认30000）
  onInvalidItems?: (items: ValidationResult[]) => void // 无效商品回调
}

export function useCartValidation(options: UseCartValidationOptions = {}) {
  const {
    enabled = true,
    pollingInterval = 30000,
    onInvalidItems,
  } = options

  const items = useCartStore((state) => state.items)
  const validateItems = useCartStore((state) => state.validateItems)
  const isVisible = usePageVisibility()
  const supabase = createClient()

  const [isValidating, setIsValidating] = useState(false)
  const [invalidItems, setInvalidItems] = useState<ValidationResult[]>([])
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // 执行验证（带重试机制）
  const validate = useCallback(async (retryCount = 0) => {
    if (items.length === 0) {
      setInvalidItems([])
      return
    }

    setIsValidating(true)
    try {
      const results = await validateItems(supabase)
      const invalid = results.filter((r) => !r.isValid)
      setInvalidItems(invalid)

      if (invalid.length > 0 && onInvalidItems) {
        onInvalidItems(invalid)
      }
    } catch (error: any) {
      console.error('Error validating cart items:', error)
      
      // 对于网络错误（CORS、502等），重试最多2次
      const isNetworkError = 
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('CORS') ||
        error?.code === 'PGRST301' || // Supabase connection error
        error?.code === 'PGRST302'   // Supabase timeout error
      
      if (isNetworkError && retryCount < 2) {
        console.log(`Retrying cart validation (attempt ${retryCount + 1}/2)...`)
        // 等待1秒后重试
        await new Promise(resolve => setTimeout(resolve, 1000))
        return validate(retryCount + 1)
      }
    } finally {
      setIsValidating(false)
    }
  }, [items.length, validateItems, supabase, onInvalidItems])

  // 清理 Realtime 订阅
  const cleanupRealtime = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [supabase])

  // 清理轮询
  const cleanupPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [])

  // 使用 ref 保存最新的商品ID列表，以便在回调中使用
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // 设置 Realtime 订阅
  useEffect(() => {
    if (!enabled || items.length === 0 || !isVisible) {
      cleanupRealtime()
      return
    }

    // 清理轮询（切换到 Realtime）
    cleanupPolling()

    const productIds = items.map((item) => item.product_id)
    if (productIds.length === 0) return

    // 创建 Realtime 订阅
    // 注意：Supabase Realtime 不支持 in 操作符，所以订阅整个表并在客户端过滤
    const channel = supabase
      .channel(`cart_validation_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products',
        },
        (payload) => {
          // 检查更新的商品是否在购物车中（使用最新的商品列表）
          const updatedProductId = payload.new?.id
          const currentProductIds = itemsRef.current.map((item) => item.product_id)
          if (updatedProductId && currentProductIds.includes(updatedProductId)) {
            // 商品更新时触发验证
            validate()
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    // 初始验证
    validate()

    return () => {
      cleanupRealtime()
    }
  }, [enabled, items, isVisible, supabase, validate, cleanupRealtime, cleanupPolling])

  // 设置轮询（页面不可见时）
  useEffect(() => {
    if (!enabled || items.length === 0 || isVisible) {
      cleanupPolling()
      return
    }

    // 清理 Realtime（切换到轮询）
    cleanupRealtime()

    // 初始验证
    validate()

    // 设置定期轮询
    pollingIntervalRef.current = setInterval(() => {
      validate()
    }, pollingInterval)

    return () => {
      cleanupPolling()
    }
  }, [enabled, items.length, isVisible, pollingInterval, validate, cleanupPolling, cleanupRealtime])

  // 当购物车商品变化时，重新验证
  useEffect(() => {
    if (enabled && items.length > 0) {
      // 使用防抖，避免频繁验证
      const timeoutId = setTimeout(() => {
        validate()
      }, 500)

      return () => {
        clearTimeout(timeoutId)
      }
    }
  }, [items, enabled, validate])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanupRealtime()
      cleanupPolling()
    }
  }, [cleanupRealtime, cleanupPolling])

  return {
    isValidating,
    invalidItems,
    validate,
  }
}
