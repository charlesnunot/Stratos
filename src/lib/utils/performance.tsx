/**
 * Performance optimization utilities
 */

import React, { Suspense } from 'react'

/**
 * Debounce function to limit function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Throttle function to limit function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Lazy load component with error boundary
 */
export function lazyLoadComponent<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallback?: React.ReactNode
) {
  const LazyComponent = React.lazy(importFn)

  function LazyLoadWrapper(props: React.ComponentProps<T>) {
    return (
      <Suspense fallback={fallback || <div>Loading...</div>}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
  LazyLoadWrapper.displayName = 'LazyLoadWrapper'
  return LazyLoadWrapper
}

/**
 * Memoize expensive computations
 */
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>()

  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args)
    
    if (cache.has(key)) {
      return cache.get(key)
    }

    const result = fn(...args)
    cache.set(key, result)
    return result
  }) as T
}

/**
 * Virtual scrolling helper
 */
export function getVisibleItems<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  scrollTop: number
): { startIndex: number; endIndex: number; visibleItems: T[] } {
  const startIndex = Math.floor(scrollTop / itemHeight)
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  )

  const visibleItems = items.slice(startIndex, endIndex)

  return {
    startIndex,
    endIndex,
    visibleItems,
  }
}

/**
 * Batch operations to reduce renders
 */
export function batchUpdates<T>(
  updates: Array<() => T>,
  batchSize: number = 10
): Promise<T[]> {
  return new Promise((resolve) => {
    const results: T[] = []
    let index = 0

    const processBatch = () => {
      const batch = updates.slice(index, index + batchSize)
      batch.forEach((update) => {
        results.push(update())
      })
      index += batchSize

      if (index < updates.length) {
        requestAnimationFrame(processBatch)
      } else {
        resolve(results)
      }
    }

    processBatch()
  })
}
