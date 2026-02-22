'use client'

import React, { forwardRef, useCallback } from 'react'
import { useImageLazyLoad, createPlaceholderSvg, createErrorSvg } from '@/lib/hooks/useImageLazyLoad'
import { useWebPSupport, getOptimizedImageUrl } from '@/lib/hooks/useImageFormat'
import { ImageSkeleton } from '@/components/ui/ImageSkeleton'
import { cn } from '@/lib/utils'

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  placeholder?: string
  errorPlaceholder?: string
  observerOptions?: {
    rootMargin?: string
    threshold?: number | number[]
  }
  className?: string
  onLoad?: () => void
  onError?: () => void
  sizes?: string
  responsiveSizes?: number[]
}

export const LazyImage = forwardRef<HTMLImageElement, LazyImageProps>(
  (
    {
      src,
      alt,
      placeholder = createPlaceholderSvg(100, 100, '#f3f4f6'),
      errorPlaceholder = createErrorSvg(100, 100, '#ef4444'),
      observerOptions,
      className,
      onLoad,
      onError,
      sizes,
      responsiveSizes = [400, 800, 1200, 1600],
      ...props
    },
    ref
  ) => {
    const supportsWebP = useWebPSupport()
    const optimizedSrc = getOptimizedImageUrl(src, {
      format: supportsWebP ? 'webp' : 'jpeg',
      quality: 85
    })

    // 生成响应式图片 srcset
    const srcSet = responsiveSizes
      .map(width => {
        const responsiveUrl = getOptimizedImageUrl(src, {
          format: supportsWebP ? 'webp' : 'jpeg',
          quality: 85,
          width
        })
        return `${responsiveUrl} ${width}w`
      })
      .join(', ')

    const {
      isLoaded,
      isLoading,
      hasError,
      ref: imgRef,
      retry
    } = useImageLazyLoad(optimizedSrc, {
      observerOptions,
      placeholderSrc: placeholder,
      errorSrc: errorPlaceholder
    })

    const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
      onLoad?.()
    }, [onLoad])

    const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
      onError?.()
    }, [onError])

    return (
      <div className="relative w-full h-full">
        {/* 加载中 */}
        {isLoading && <ImageSkeleton className="absolute inset-0" />}
        
        {/* 加载失败 - 显示加载动画 */}
        {hasError && !isLoading && (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
        
        {/* 图片 */}
        <img
          ref={(node) => {
            imgRef(node)
            if (ref && typeof ref === 'function') {
              ref(node)
            } else if (ref && 'current' in ref) {
              ref.current = node
            }
          }}
          src={hasError ? errorPlaceholder : isLoaded ? optimizedSrc : placeholder}
          srcSet={isLoaded ? srcSet : undefined}
          sizes={isLoaded ? sizes : undefined}
          alt={alt}
          className={cn(
            'transition-opacity duration-300',
            !isLoaded && !hasError && 'opacity-0',
            isLoaded && 'opacity-100',
            className
          )}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      </div>
    )
  }
)

LazyImage.displayName = 'LazyImage'

// 预加载图片工具函数
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error(`Failed to preload image: ${src}`))
    img.src = src
  })
}

// 批量预加载图片工具函数
export function preloadImages(srcs: string[]): Promise<void[]> {
  return Promise.all(srcs.map(preloadImage))
}