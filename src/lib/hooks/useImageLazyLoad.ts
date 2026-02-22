import { useState, useEffect, useRef, useCallback } from 'react'

interface IntersectionObserverOptions {
  root?: Element | null
  rootMargin?: string
  threshold?: number | number[]
}

interface ImageLazyLoadOptions {
  observerOptions?: IntersectionObserverOptions
  placeholderSrc?: string
  errorSrc?: string
}

interface ImageLazyLoadHookReturn {
  isLoaded: boolean
  isLoading: boolean
  hasError: boolean
  ref: React.RefCallback<HTMLImageElement>
  retry: () => void
  retryCount: number
}

const DEFAULT_OBSERVER_OPTIONS: IntersectionObserverOptions = {
  rootMargin: '200px 0px',
  threshold: 0.1
}

export function useImageLazyLoad(
  src: string,
  options: ImageLazyLoadOptions = {}
): ImageLazyLoadHookReturn {
  const observerOptions = options.observerOptions ?? DEFAULT_OBSERVER_OPTIONS
  const { placeholderSrc, errorSrc } = options

  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  // 使用 MutableRefObject 来允许修改 current
  const imgRef = useRef<HTMLImageElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const maxRetries = 3

  const loadImage = useCallback(() => {
    setIsLoading(true)
    setHasError(false)
    
    // 加载图片
    const img = new Image()
    img.src = src
    
    img.onload = () => {
      setIsLoaded(true)
      setIsLoading(false)
      setHasError(false)
      setRetryCount(0)
    }
    
    img.onerror = () => {
      setIsLoading(false)
      setHasError(true)
      
      // 自动重试逻辑
      if (retryCount < maxRetries) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          loadImage()
        }, 1000 * (retryCount + 1)) // 指数退避
      }
    }
  }, [src, retryCount])

  useEffect(() => {
    // 清理之前的 observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (!imgRef.current) {
      return
    }

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadImage()
          
          // 停止观察
          if (observerRef.current) {
            observerRef.current.disconnect()
          }
        }
      })
    }, observerOptions)

    if (imgRef.current) {
      observerRef.current.observe(imgRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [src, observerOptions, loadImage])

  // 手动重试函数
  const retry = useCallback(() => {
    setRetryCount(0)
    setIsLoaded(false)
    setHasError(false)
    loadImage()
  }, [loadImage])

  // 使用 useCallback 并正确处理 ref 赋值
  const refCallback = useCallback<React.RefCallback<HTMLImageElement>>((node) => {
    if (node !== null) {
      imgRef.current = node
    }
  }, [])

  return {
    isLoaded,
    isLoading,
    hasError,
    ref: refCallback,
    retry,
    retryCount
  }
}

// 工具函数：创建占位符 SVG
export function createPlaceholderSvg(
  width: number = 100,
  height: number = 100,
  color: string = '#f3f4f6'
): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'%3E%3Crect width='${width}' height='${height}' fill='${color}'/%3E%3C/svg%3E`
}

// 工具函数：创建错误占位符 SVG
export function createErrorSvg(
  width: number = 100,
  height: number = 100,
  color: string = '#ef4444'
): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'%3E%3Crect width='${width}' height='${height}' fill='${color}'/%3E%3Ctext x='${width/2}' y='${height/2 + 5}' font-family='Arial' font-size='20' text-anchor='middle' fill='white'%3E!%3C/text%3E%3C/svg%3E`
}
