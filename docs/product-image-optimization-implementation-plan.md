# 商品图片轮播优化功能 - 修复与增强实施计划

## 文档概述

基于代码审查发现的问题和建议，本计划提供系统性的修复和优化实施方案。

**优先级说明**:
- 🔴 P0 (Critical): 必须立即修复，影响核心功能
- 🟠 P1 (High): 高优先级，建议尽快实施
- 🟡 P2 (Medium): 中等优先级，可排期实施
- 🟢 P3 (Low): 低优先级，后续迭代

**预计总工期**:
- 修复阶段: 1-2小时
- 短期优化: 2-3小时
- 中期优化: 1-2天
- 长期优化: 1周

---

## 🔴 修复阶段（P0 - 必须修复）

### 问题1: ImageLightbox 内图片未实现懒加载

#### 问题描述
- Lightbox 组件内直接加载所有图片，包括底部缩略图
- 当商品有多张高清大图时，同时加载会占用大量带宽
- 影响 Lightbox 打开速度和性能

#### 影响范围
- 用户体验: 打开 Lightbox 时有明显延迟
- 性能: 移动端可能卡顿或崩溃
- 带宽: 用户流量消耗增加

#### 修复方案

**步骤1: 修改 ImageLightbox 组件**

**文件**: `src/components/ecommerce/ImageLightbox.tsx`

**修改内容**:

```typescript
// 在文件顶部添加导入
import { LazyImage } from '@/components/ui/LazyImage'

// 修改图片显示区域（第139-158行）
// 当前代码:
<img
  src={images[currentIndex]}
  alt={`图片 ${currentImageIndex + 1}`}
  className={cn(
    "max-w-full max-h-full object-contain transition-transform duration-200",
    isLoading ? "opacity-0" : "opacity-100"
  )}
  style={{ transform: `scale(${scale})` }}
  onLoad={() => setIsLoading(false)}
/>

// 修改为:
<LazyImage
  src={images[currentIndex]}
  alt={`图片 ${currentImageIndex + 1}`}
  className={cn(
    "max-w-full max-h-full object-contain transition-transform duration-200",
    isLoading ? "opacity-0" : "opacity-100"
  )}
  style={{ transform: `scale(${scale})` }}
  onLoad={() => setIsLoading(false)}
  observerOptions={{ rootMargin: '0px', threshold: 0 }}
/>

// 修改底部缩略图（第202-207行）
// 当前代码:
<img
  src={image}
  alt={`缩略图 ${index + 1}`}
  className="w-full h-full object-cover"
/>

// 修改为:
<LazyImage
  src={image}
  alt={`缩略图 ${index + 1}`}
  className="w-full h-full object-cover"
  observerOptions={{ rootMargin: '50px', threshold: 0 }}
/>
```

**注意事项**:
- Lightbox 内主图应设置 `rootMargin: '0px'` 立即加载
- 缩略图设置 `rootMargin: '50px'` 提前预加载
- 保持原有的点击切换逻辑不变

---

### 问题2: 滑动提示显示逻辑不完善

#### 问题描述
- 滑动提示仅在 hover 时显示（`opacity-0 hover:opacity-100`）
- 移动端用户不知道可以左右滑动
- 首次访问用户无法发现滑动功能

#### 影响范围
- 用户体验: 移动端用户可能不知道滑动切换功能
- 可用性: 降低交互功能的发现率

#### 修复方案

**步骤1: 添加自动显示提示逻辑**

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**添加状态**:
```typescript
// 在组件状态区域（约第77-78行后）添加
const [showSwipeHint, setShowSwipeHint] = useState(true)

// 使用 useEffect 控制提示自动消失
useEffect(() => {
  if (showSwipeHint) {
    const timer = setTimeout(() => {
      setShowSwipeHint(false)
    }, 3000) // 3秒后自动消失
    return () => clearTimeout(timer)
  }
}, [showSwipeHint])

// 首次滑动后隐藏提示
const handleSwipeLeft = () => {
  if (product.images.length > 1 && !selectedColorImage) {
    setCurrentImageIndex((prev) => (prev + 1) % product.images.length)
    setShowSwipeHint(false) // 滑动后隐藏提示
  }
}

const handleSwipeRight = () => {
  if (product.images.length > 1 && !selectedColorImage) {
    setCurrentImageIndex((prev) => 
      prev === 0 ? product.images.length - 1 : prev - 1
    )
    setShowSwipeHint(false) // 滑动后隐藏提示
  }
}
```

**步骤2: 修改滑动提示组件**

**修改提示显示逻辑**（约第411-422行）:
```tsx
{product.images.length > 1 && !selectedColorImage && (
  <>
    {/* 左侧滑动提示 */}
    <div 
      className={`
        absolute left-2 top-1/2 -translate-y-1/2 
        bg-black/50 text-white p-3 rounded-full 
        transition-all duration-500 md:hidden
        ${showSwipeHint ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
      `}
    >
      <span className="text-lg">←</span>
    </div>
    {/* 右侧滑动提示 */}
    <div 
      className={`
        absolute right-2 top-1/2 -translate-y-1/2 
        bg-black/50 text-white p-3 rounded-full 
        transition-all duration-500 md:hidden
        ${showSwipeHint ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
      `}
    >
      <span className="text-lg">→</span>
    </div>
    
    {/* 提示文字 */}
    {showSwipeHint && (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full md:hidden animate-pulse">
        左右滑动切换图片
      </div>
    )}
  </>
)}
```

**步骤3: 添加点击提示重新显示**
```typescript
// 在 handleSwipe 函数中添加首次提示
const handleSwipeLeft = () => {
  // ... 原有逻辑
  if (!hasUserSwiped) {
    setHasUserSwiped(true)
    // 记录到 localStorage，下次访问不再显示
    localStorage.setItem('product_swipe_hint_shown', 'true')
  }
}
```

---

### 问题3: 图片加载失败缺少重试机制

#### 问题描述
- useImageLazyLoad 中图片加载失败只显示错误占位符
- 用户无法手动重试加载
- 网络波动时用户体验差

#### 影响范围
- 用户体验: 图片加载失败后无法恢复
- 容错性: 缺乏错误恢复机制

#### 修复方案

**步骤1: 增强 useImageLazyLoad Hook**

**文件**: `src/lib/hooks/useImageLazyLoad.ts`

**修改 Hook 接口**:
```typescript
interface ImageLazyLoadHookReturn {
  isLoaded: boolean
  isLoading: boolean
  hasError: boolean
  ref: React.RefCallback<HTMLImageElement>
  retry: () => void  // ✅ 添加重试函数
  retryCount: number // ✅ 添加重试计数
}
```

**修改 Hook 实现**:
```typescript
export function useImageLazyLoad(
  src: string,
  options: ImageLazyLoadOptions = {}
): ImageLazyLoadHookReturn {
  // ... 原有代码
  
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  const loadImage = useCallback(() => {
    if (!imgRef.current) return
    
    setIsLoading(true)
    setHasError(false)
    
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
    // ... 原有 IntersectionObserver 逻辑
    
    if (entry.isIntersecting) {
      loadImage()
    }
  }, [src, retryCount]) // 添加 retryCount 依赖

  // 手动重试函数
  const retry = useCallback(() => {
    setRetryCount(0)
    setIsLoaded(false)
    setHasError(false)
    loadImage()
  }, [loadImage])

  return {
    isLoaded,
    isLoading,
    hasError,
    ref: refCallback,
    retry,        // ✅ 返回重试函数
    retryCount    // ✅ 返回重试计数
  }
}
```

**步骤2: 修改 LazyImage 组件支持重试**

**文件**: `src/components/ui/LazyImage.tsx`

**添加重试按钮**:
```tsx
export const LazyImage = forwardRef<HTMLImageElement, LazyImageProps>(
  ({ src, alt, className, onLoad, onError, ...props }, ref) => {
    const { isLoaded, isLoading, hasError, ref: imgRef, retry } = useImageLazyLoad(src)
    
    return (
      <div className="relative w-full h-full">
        {/* 加载中 */}
        {isLoading && (
          <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {/* 加载失败 */}
        {hasError && !isLoading && (
          <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2">
            <span className="text-muted-foreground text-sm">加载失败</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                retry()
              }}
              className="px-3 py-1 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors"
            >
              重试
            </button>
          </div>
        )}
        
        {/* 图片 */}
        {isLoaded && (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className={cn("w-full h-full object-cover", className)}
            onLoad={onLoad}
            onError={onError}
            {...props}
          />
        )}
      </div>
    )
  }
)
```

---

## 🟠 短期优化（P1 - 建议尽快实施）

### 优化1: 添加骨架屏加载效果

#### 实施方案

**创建骨架屏组件**:

**文件**: `src/components/ui/ImageSkeleton.tsx`（新建）

```typescript
'use client'

import { cn } from '@/lib/utils'

interface ImageSkeletonProps {
  className?: string
}

export function ImageSkeleton({ className }: ImageSkeletonProps) {
  return (
    <div className={cn(
      "relative overflow-hidden bg-muted",
      "before:absolute before:inset-0",
      "before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
      "before:animate-shimmer",
      className
    )}>
      {/* 图片占位符图标 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          className="w-12 h-12 text-muted-foreground/30"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    </div>
  )
}
```

**添加动画样式**（tailwind.config.ts）:
```typescript
// 在 theme.extend.animation 中添加
animation: {
  shimmer: 'shimmer 2s infinite',
},
keyframes: {
  shimmer: {
    '0%': { transform: 'translateX(-100%)' },
    '100%': { transform: 'translateX(100%)' },
  },
},
```

**在 LazyImage 中使用**:
```tsx
// 替换原有的 bg-muted animate-pulse
{isLoading && <ImageSkeleton className="absolute inset-0" />}
```

**预计时间**: 30分钟

---

### 优化2: 图片加载进度指示器

#### 实施方案

**创建进度 Hook**:

**文件**: `src/lib/hooks/useImageProgress.ts`（新建）

```typescript
import { useState, useCallback } from 'react'

export function useImageProgress() {
  const [progress, setProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const startLoading = useCallback(() => {
    setIsLoading(true)
    setProgress(0)
  }, [])

  const updateProgress = useCallback((percent: number) => {
    setProgress(percent)
  }, [])

  const finishLoading = useCallback(() => {
    setProgress(100)
    setTimeout(() => {
      setIsLoading(false)
      setProgress(0)
    }, 300)
  }, [])

  return { progress, isLoading, startLoading, updateProgress, finishLoading }
}
```

**在 Lightbox 中使用**:
```tsx
// 显示加载进度条
{isLoading && (
  <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
    <div 
      className="h-full bg-white transition-all duration-300"
      style={{ width: `${progress}%` }}
    />
  </div>
)}
```

**预计时间**: 30分钟

---

### 优化3: Lightbox 双指缩放手势

#### 实施方案

**创建缩放手势 Hook**:

**文件**: `src/lib/hooks/usePinchZoom.ts`（新建）

```typescript
import { useState, useCallback } from 'react'

export function usePinchZoom() {
  const [scale, setScale] = useState(1)
  const [initialDistance, setInitialDistance] = useState(0)

  const getDistance = (touches: React.TouchList) => {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    )
  }

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setInitialDistance(getDistance(e.touches))
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistance > 0) {
      e.preventDefault()
      const currentDistance = getDistance(e.touches)
      const newScale = Math.min(Math.max(
        currentDistance / initialDistance,
        1
      ), 3)
      setScale(newScale)
    }
  }, [initialDistance])

  const onTouchEnd = useCallback(() => {
    setInitialDistance(0)
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
  }, [])

  return { scale, onTouchStart, onTouchMove, onTouchEnd, resetZoom }
}
```

**在 Lightbox 中集成**:
```tsx
const { scale, onTouchStart, onTouchMove, onTouchEnd, resetZoom } = usePinchZoom()

// 在图片容器上绑定事件
<div
  onTouchStart={onTouchStart}
  onTouchMove={onTouchMove}
  onTouchEnd={onTouchEnd}
>
  <img style={{ transform: `scale(${scale})` }} />
</div>
```

**预计时间**: 1小时

---

## 🟡 中期优化（P2 - 可排期实施）

### 优化4: WebP 格式自动降级

#### 实施方案

**创建图片格式检测 Hook**:

**文件**: `src/lib/hooks/useImageFormat.ts`（新建）

```typescript
import { useState, useEffect } from 'react'

export function useWebPSupport() {
  const [supportsWebP, setSupportsWebP] = useState(false)

  useEffect(() => {
    const checkWebP = async () => {
      const webpData = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='
      const img = new Image()
      img.onload = () => setSupportsWebP(true)
      img.onerror = () => setSupportsWebP(false)
      img.src = webpData
    }
    checkWebP()
  }, [])

  return supportsWebP
}

// 使用 CDN 自动转换
export function getOptimizedImageUrl(
  originalUrl: string,
  options: {
    width?: number
    height?: number
    format?: 'webp' | 'jpeg' | 'auto'
    quality?: number
  } = {}
): string {
  // 如果是 Supabase 存储，使用其转换功能
  if (originalUrl.includes('supabase.co')) {
    const url = new URL(originalUrl)
    if (options.width) url.searchParams.set('width', String(options.width))
    if (options.height) url.searchParams.set('height', String(options.height))
    // Supabase 支持 auto 格式，会自动返回 WebP
    url.searchParams.set('format', options.format || 'auto')
    if (options.quality) url.searchParams.set('quality', String(options.quality))
    return url.toString()
  }
  
  return originalUrl
}
```

**预计时间**: 2小时

---

### 优化5: 响应式图片 (srcset)

#### 实施方案

**创建响应式图片组件**:

**文件**: `src/components/ui/ResponsiveImage.tsx`（新建）

```typescript
interface ResponsiveImageProps {
  src: string
  alt: string
  sizes?: string
  className?: string
}

export function ResponsiveImage({ src, alt, sizes, className }: ResponsiveImageProps) {
  // 生成不同尺寸的图片 URL
  const srcSet = [
    `${getOptimizedImageUrl(src, { width: 320 })} 320w`,
    `${getOptimizedImageUrl(src, { width: 640 })} 640w`,
    `${getOptimizedImageUrl(src, { width: 1024 })} 1024w`,
    `${getOptimizedImageUrl(src, { width: 1920 })} 1920w`,
  ].join(', ')

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes || "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
      alt={alt}
      className={className}
      loading="lazy"
    />
  )
}
```

**预计时间**: 2小时

---

## 🟢 长期优化（P3 - 后续迭代）

### 优化6: 缩略图虚拟列表

#### 问题
- 当商品有几十张图片时，所有缩略图同时渲染性能差

#### 方案
使用 `react-window` 或 `@tanstack/react-virtual` 实现虚拟列表

**预计时间**: 1天

---

### 优化7: Service Worker 图片缓存

#### 方案
使用 Workbox 预缓存已浏览的商品图片，支持离线查看

**预计时间**: 2天

---

### 优化8: AI 图片优化

#### 方案
- 智能压缩：根据网络状况调整图片质量
- 智能裁剪：自动聚焦商品主体
- 智能增强：自动调整亮度对比度

**预计时间**: 1周

---

## 📋 实施时间表

### 第一周

| 日期 | 任务 | 优先级 | 预计时间 |
|------|------|--------|----------|
| Day 1 | 修复 ImageLightbox 懒加载 | 🔴 P0 | 30分钟 |
| Day 1 | 修复滑动提示显示逻辑 | 🔴 P0 | 45分钟 |
| Day 1 | 修复图片加载重试机制 | 🔴 P0 | 1小时 |
| Day 2 | 添加骨架屏加载效果 | 🟠 P1 | 30分钟 |
| Day 2 | 添加加载进度指示器 | 🟠 P1 | 30分钟 |
| Day 3 | Lightbox 双指缩放 | 🟠 P1 | 1小时 |

### 第二周

| 日期 | 任务 | 优先级 | 预计时间 |
|------|------|--------|----------|
| Day 1-2 | WebP 格式自动降级 | 🟡 P2 | 2小时 |
| Day 3-4 | 响应式图片 srcset | 🟡 P2 | 2小时 |

### 后续迭代

| 任务 | 优先级 | 预计时间 |
|------|--------|----------|
| 缩略图虚拟列表 | 🟢 P3 | 1天 |
| Service Worker 缓存 | 🟢 P3 | 2天 |
| AI 图片优化 | 🟢 P3 | 1周 |

---

## ✅ 测试清单

### 修复阶段测试

- [ ] Lightbox 内图片懒加载正常工作
- [ ] 滑动提示首次自动显示3秒后消失
- [ ] 图片加载失败显示重试按钮
- [ ] 重试按钮点击后能重新加载
- [ ] 自动重试3次后停止

### 优化阶段测试

- [ ] 骨架屏动画流畅
- [ ] 加载进度条准确显示
- [ ] 双指缩放范围 1x-3x
- [ ] WebP 格式浏览器支持检测正确
- [ ] 响应式图片根据屏幕加载合适尺寸

---

## 📊 预期效果

| 指标 | 当前 | 修复后 | 优化后 |
|------|------|--------|--------|
| Lightbox 打开时间 | ~2s | ~0.5s | ~0.3s |
| 图片加载成功率 | 95% | 98% | 99.5% |
| 移动端交互满意度 | 70% | 85% | 95% |
| 首屏加载时间 | ~3s | ~2s | ~1s |
| 带宽消耗 | 100% | 60% | 40% |

---

*文档创建时间*: 2026-02-08
*适用版本*: Stratos v0.1.1
*文档版本*: v1.0
*状态*: 待实施
