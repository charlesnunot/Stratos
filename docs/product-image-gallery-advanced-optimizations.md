# 商品图片轮播高级优化方案

## 概述

基于已完成的图片轮播基础功能，本方案提供4个高级优化方向，提升用户体验和性能。

---

## 优化1: 图片懒加载 (Lazy Loading)

### 问题
- 商品有多张图片时，所有图片同时加载，浪费带宽
- 首屏加载时间增加
- 影响页面性能评分

### 解决方案

#### 步骤1: 创建懒加载Hook

**文件**: `src/lib/hooks/useImageLazyLoad.ts`（新建）

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'

interface UseImageLazyLoadOptions {
  rootMargin?: string
  threshold?: number
}

export function useImageLazyLoad(options: UseImageLazyLoadOptions = {}) {
  const { rootMargin = '50px', threshold = 0.1 } = options
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold }
    )

    observer.observe(img)

    return () => observer.disconnect()
  }, [rootMargin, threshold])

  const onLoad = useCallback(() => {
    setIsLoaded(true)
  }, [])

  return { imgRef, isLoaded, isInView, onLoad }
}

// 预加载下一张图片
export function usePreloadNextImage(
  images: string[],
  currentIndex: number
) {
  useEffect(() => {
    if (images.length <= 1) return
    
    const nextIndex = (currentIndex + 1) % images.length
    const nextImage = new Image()
    nextImage.src = images[nextIndex]
  }, [images, currentIndex])
}
```

#### 步骤2: 创建懒加载图片组件

**文件**: `src/components/ecommerce/LazyImage.tsx`（新建）

```typescript
'use client'

import { useImageLazyLoad } from '@/lib/hooks/useImageLazyLoad'
import { cn } from '@/lib/utils'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  placeholderClassName?: string
}

export function LazyImage({ 
  src, 
  alt, 
  className,
  placeholderClassName 
}: LazyImageProps) {
  const { imgRef, isLoaded, isInView, onLoad } = useImageLazyLoad()

  return (
    <div className="relative w-full h-full">
      {/* 占位符/加载状态 */}
      {!isLoaded && (
        <div className={cn(
          "absolute inset-0 bg-muted animate-pulse",
          placeholderClassName
        )} />
      )}
      
      {/* 实际图片 */}
      {isInView && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            className
          )}
          onLoad={onLoad}
        />
      )}
    </div>
  )
}
```

#### 步骤3: 修改 ProductPageClient.tsx 应用懒加载

**文件**: `ProductPageClient.tsx`

**导入Hook**:
```typescript
import { useImageLazyLoad, usePreloadNextImage } from '@/lib/hooks/useImageLazyLoad'
import { LazyImage } from '@/components/ecommerce/LazyImage'
```

**在主图区域应用**:
```tsx
// 在主图组件内添加预加载
const { imgRef, isLoaded } = useImageLazyLoad()

// 预加载下一张图片
usePreloadNextImage(product.images || [], currentImageIndex)

// 修改主图渲染
<div className="relative aspect-square w-full overflow-hidden rounded-lg">
  {!isLoaded && (
    <div className="absolute inset-0 bg-muted animate-pulse" />
  )}
  <img
    ref={imgRef}
    src={selectedColorImage || product.images[currentImageIndex]}
    alt={displayName}
    className={`h-full w-full object-cover max-w-full cursor-pointer transition-opacity duration-300 ${
      isLoaded ? 'opacity-100' : 'opacity-0'
    }`}
    onClick={() => {
      if (product.images.length > 1 && !selectedColorImage) {
        setCurrentImageIndex((prev) => (prev + 1) % product.images.length)
      }
    }}
  />
</div>
```

**在缩略图应用懒加载**:
```tsx
// 缩略图区域使用 LazyImage 组件
{product.images.map((image: string, index: number) => (
  <div
    key={index}
    onClick={() => setCurrentImageIndex(index)}
    className={/* ... */}
  >
    <LazyImage
      src={image}
      alt={`${displayName} ${index + 1}`}
      className="h-full w-full object-cover"
      placeholderClassName="bg-gray-200"
    />
    {/* 选中遮罩 */}
    {currentImageIndex === index && (
      <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
    )}
  </div>
))}
```

### 优化效果
- ✅ 首屏只加载当前显示的图片
- ✅ 缩略图进入视口才加载
- ✅ 自动预加载下一张图片
- ✅ 平滑的加载过渡动画
- ✅ 减少带宽消耗，提升性能

---

## 优化2: 触摸滑动支持 (Touch Swipe)

### 问题
- 移动端用户习惯左右滑动切换图片
- 当前只能通过点击缩略图或主图切换
- 用户体验不够自然

### 解决方案

#### 步骤1: 创建触摸滑动Hook

**文件**: `src/lib/hooks/useSwipe.ts`（新建）

```typescript
import { useState, useCallback, useRef } from 'react'

interface SwipeState {
  startX: number
  startY: number
  isSwiping: boolean
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number
}

export function useSwipe(options: UseSwipeOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50
  } = options

  const [swipeState, setSwipeState] = useState<SwipeState>({
    startX: 0,
    startY: 0,
    isSwiping: false
  })

  const touchStart = useCallback((e: React.TouchEvent) => {
    setSwipeState({
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      isSwiping: true
    })
  }, [])

  const touchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeState.isSwiping) return
    
    // 阻止默认滚动行为（横向滑动时）
    const diffX = swipeState.startX - e.touches[0].clientX
    if (Math.abs(diffX) > 10) {
      e.preventDefault()
    }
  }, [swipeState.isSwiping, swipeState.startX])

  const touchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeState.isSwiping) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const diffX = swipeState.startX - endX
    const diffY = swipeState.startY - endY

    // 判断是横向还是纵向滑动
    if (Math.abs(diffX) > Math.abs(diffY)) {
      // 横向滑动
      if (Math.abs(diffX) > threshold) {
        if (diffX > 0) {
          onSwipeLeft?.()
        } else {
          onSwipeRight?.()
        }
      }
    } else {
      // 纵向滑动
      if (Math.abs(diffY) > threshold) {
        if (diffY > 0) {
          onSwipeUp?.()
        } else {
          onSwipeDown?.()
        }
      }
    }

    setSwipeState(prev => ({ ...prev, isSwiping: false }))
  }, [swipeState, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown])

  return {
    swipeHandlers: {
      onTouchStart: touchStart,
      onTouchMove: touchMove,
      onTouchEnd: touchEnd
    },
    isSwiping: swipeState.isSwiping
  }
}
```

#### 步骤2: 修改 ProductPageClient.tsx 应用滑动

**文件**: `ProductPageClient.tsx`

**导入Hook**:
```typescript
import { useSwipe } from '@/lib/hooks/useSwipe'
```

**在主图区域应用**:
```tsx
// 在组件内添加滑动处理
const { swipeHandlers } = useSwipe({
  onSwipeLeft: () => {
    // 向左滑：下一张
    if (product.images.length > 1 && !selectedColorImage) {
      setCurrentImageIndex((prev) => (prev + 1) % product.images.length)
    }
  },
  onSwipeRight: () => {
    // 向右滑：上一张
    if (product.images.length > 1 && !selectedColorImage) {
      setCurrentImageIndex((prev) => 
        prev === 0 ? product.images.length - 1 : prev - 1
      )
    }
  },
  threshold: 50
})

// 修改主图容器，添加触摸事件
<div 
  className="relative aspect-square w-full overflow-hidden rounded-lg touch-pan-y"
  {...swipeHandlers}
>
  <img
    src={selectedColorImage || product.images[currentImageIndex]}
    alt={displayName}
    className="h-full w-full object-cover max-w-full cursor-pointer"
    draggable={false}  // 禁用默认拖拽
  />
  
  {/* 滑动提示（可选） */}
  {product.images.length > 1 && !selectedColorImage && (
    <>
      {/* 左侧滑动提示 */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 text-white p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity md:hidden">
        ←
      </div>
      {/* 右侧滑动提示 */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 text-white p-2 rounded-full opacity-0 hover:opacity-100 transition-opacity md:hidden">
        →
      </div>
    </>
  )}
</div>
```

### 优化效果
- ✅ 移动端支持左右滑动切换图片
- ✅ 自然的手势交互体验
- ✅ 防止误触（阈值控制）
- ✅ 滑动方向提示

---

## 优化3: 图片放大查看 (Lightbox)

### 问题
- 用户无法查看商品大图细节
- 小屏幕设备上图细节看不清
- 缺乏沉浸式的图片浏览体验

### 解决方案

#### 步骤1: 创建 Lightbox 组件

**文件**: `src/components/ecommerce/ImageLightbox.tsx`（新建）

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImageLightboxProps {
  images: string[]
  initialIndex: number
  isOpen: boolean
  onClose: () => void
  onIndexChange?: (index: number) => void
}

export function ImageLightbox({
  images,
  initialIndex,
  isOpen,
  onClose,
  onIndexChange
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  useEffect(() => {
    if (!isOpen) {
      setScale(1)
      setIsLoading(true)
    }
  }, [isOpen])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
    setScale(1)
    setIsLoading(true)
  }, [images.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length)
    setScale(1)
    setIsLoading(true)
  }, [images.length])

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.5, 3))
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.5, 1))

  // 键盘导航
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          goToPrevious()
          break
        case 'ArrowRight':
          goToNext()
          break
        case '+':
        case '=':
          handleZoomIn()
          break
        case '-':
          handleZoomOut()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, goToPrevious, goToNext])

  // 通知外部索引变化
  useEffect(() => {
    onIndexChange?.(currentIndex)
  }, [currentIndex, onIndexChange])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm">
          {currentIndex + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          {/* 缩放控制 */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={handleZoomOut}
            disabled={scale <= 1}
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="text-sm min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={handleZoomIn}
            disabled={scale >= 3}
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
          {/* 关闭按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 ml-4"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* 图片显示区域 */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* 加载状态 */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
          </div>
        )}
        
        {/* 图片 */}
        <img
          src={images[currentIndex]}
          alt={`图片 ${currentIndex + 1}`}
          className={cn(
            "max-w-full max-h-full object-contain transition-transform duration-200",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          style={{ transform: `scale(${scale})` }}
          onLoad={() => setIsLoading(false)}
          onClick={(e) => {
            // 点击图片切换下一张
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            if (x < rect.width / 2) {
              goToPrevious()
            } else {
              goToNext()
            }
          }}
        />

        {/* 左右切换按钮 */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
              onClick={goToPrevious}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
              onClick={goToNext}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </>
        )}
      </div>

      {/* 底部缩略图 */}
      {images.length > 1 && (
        <div className="p-4 bg-black/50">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentIndex(index)
                  setScale(1)
                  setIsLoading(true)
                }}
                className={cn(
                  "flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all",
                  currentIndex === index
                    ? "border-white"
                    : "border-transparent opacity-60 hover:opacity-100"
                )}
              >
                <img
                  src={image}
                  alt={`缩略图 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

#### 步骤2: 修改 ProductPageClient.tsx 集成 Lightbox

**文件**: `ProductPageClient.tsx`

**导入组件**:
```typescript
import { ImageLightbox } from '@/components/ecommerce/ImageLightbox'
```

**添加状态**:
```typescript
const [showLightbox, setShowLightbox] = useState(false)
```

**修改主图点击事件**:
```tsx
{/* 主图区域 */}
<div 
  className="relative aspect-square w-full overflow-hidden rounded-lg touch-pan-y"
  {...swipeHandlers}
>
  <img
    src={selectedColorImage || product.images[currentImageIndex]}
    alt={displayName}
    className="h-full w-full object-cover max-w-full cursor-zoom-in"
    onClick={() => {
      if (selectedColorImage) {
        // 颜色图片模式下，点击打开 Lightbox
        setShowLightbox(true)
      } else if (product.images.length > 1) {
        // 普通模式下，短点击进入 Lightbox，长按切换下一张
        setShowLightbox(true)
      }
    }}
  />
</div>

{/* Lightbox 组件 */}
<ImageLightbox
  images={selectedColorImage ? [selectedColorImage] : product.images}
  initialIndex={selectedColorImage ? 0 : currentImageIndex}
  isOpen={showLightbox}
  onClose={() => setShowLightbox(false)}
  onIndexChange={(index) => {
    if (!selectedColorImage) {
      setCurrentImageIndex(index)
    }
  }}
/>
```

### 优化效果
- ✅ 点击主图打开大图查看
- ✅ 支持缩放（1x-3x）
- ✅ 键盘导航（方向键、ESC、+/-）
- ✅ 底部缩略图快速切换
- ✅ 图片点击左右区域切换
- ✅ 沉浸式全屏体验

---

## 优化4: 智能预加载 (Smart Preloading)

### 问题
- 切换图片时有加载延迟
- 用户看到空白或加载状态
- 影响浏览流畅度

### 解决方案

#### 步骤1: 增强预加载Hook

**文件**: `src/lib/hooks/useImagePreload.ts`（新建）

```typescript
import { useEffect, useRef, useCallback } from 'react'

interface PreloadOptions {
  ahead?: number  // 预加载后面几张
  behind?: number // 预加载前面几张
}

export function useImagePreload(
  images: string[],
  currentIndex: number,
  options: PreloadOptions = {}
) {
  const { ahead = 2, behind = 1 } = options
  const loadedImages = useRef<Set<string>>(new Set())
  const preloadQueue = useRef<string[]>([])

  const preloadImage = useCallback((src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (loadedImages.current.has(src)) {
        resolve()
        return
      }

      const img = new Image()
      img.onload = () => {
        loadedImages.current.add(src)
        resolve()
      }
      img.onerror = reject
      img.src = src
    })
  }, [])

  useEffect(() => {
    if (!images.length) return

    // 计算需要预加载的图片索引
    const indicesToPreload: number[] = []
    
    // 预加载前面的图片
    for (let i = 1; i <= behind; i++) {
      const index = (currentIndex - i + images.length) % images.length
      indicesToPreload.push(index)
    }
    
    // 预加载后面的图片
    for (let i = 1; i <= ahead; i++) {
      const index = (currentIndex + i) % images.length
      indicesToPreload.push(index)
    }

    // 去重并预加载
    const uniqueIndices = [...new Set(indicesToPreload)]
    preloadQueue.current = uniqueIndices.map(i => images[i])

    // 使用 requestIdleCallback 在空闲时预加载
    const preloadNext = () => {
      const src = preloadQueue.current.shift()
      if (!src) return

      preloadImage(src).then(() => {
        // 继续预加载下一张
        if (preloadQueue.current.length > 0) {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(() => preloadNext(), { timeout: 2000 })
          } else {
            setTimeout(preloadNext, 100)
          }
        }
      })
    }

    // 开始预加载
    preloadNext()
  }, [images, currentIndex, ahead, behind, preloadImage])

  // 预加载特定图片（优先级高）
  const preloadSpecific = useCallback(async (index: number) => {
    if (index < 0 || index >= images.length) return
    await preloadImage(images[index])
  }, [images, preloadImage])

  return { preloadSpecific, isLoaded: (src: string) => loadedImages.current.has(src) }
}
```

#### 步骤2: 修改 ProductPageClient.tsx 应用预加载

**文件**: `ProductPageClient.tsx`

**导入Hook**:
```typescript
import { useImagePreload } from '@/lib/hooks/useImagePreload'
```

**应用预加载**:
```tsx
// 在组件内使用预加载
const { preloadSpecific, isLoaded } = useImagePreload(
  product.images || [],
  currentImageIndex,
  { ahead: 2, behind: 1 }  // 预加载后面2张，前面1张
)

// 在切换图片时，确保目标图片已加载
const handleImageChange = useCallback((newIndex: number) => {
  // 如果图片未加载，先预加载
  if (!isLoaded(product.images[newIndex])) {
    preloadSpecific(newIndex).then(() => {
      setCurrentImageIndex(newIndex)
    })
  } else {
    setCurrentImageIndex(newIndex)
  }
}, [product.images, isLoaded, preloadSpecific])

// 修改缩略图点击，使用 handleImageChange
onClick={() => handleImageChange(index)}
```

### 优化效果
- ✅ 智能预加载前后几张图片
- ✅ 利用浏览器空闲时间加载
- ✅ 切换图片时无延迟
- ✅ 减少用户等待时间

---

## 📋 实施建议

### 实施优先级

| 优先级 | 优化项 | 难度 | 影响 |
|--------|--------|------|------|
| P0 | 触摸滑动 | ⭐⭐ | 移动端体验提升显著 |
| P1 | 图片放大 | ⭐⭐⭐ | 用户刚需功能 |
| P2 | 智能预加载 | ⭐⭐ | 流畅度提升 |
| P3 | 懒加载 | ⭐⭐ | 性能优化 |

### 实施顺序建议

1. **第一阶段**: 触摸滑动（快速见效）
2. **第二阶段**: 图片放大（提升转化率）
3. **第三阶段**: 智能预加载（优化体验）
4. **第四阶段**: 懒加载（性能优化）

### 测试清单

- [ ] 触摸滑动在 iOS Safari 正常工作
- [ ] 触摸滑动在 Android Chrome 正常工作
- [ ] Lightbox 键盘导航正常
- [ ] Lightbox 缩放功能正常
- [ ] 图片切换无卡顿
- [ ] 内存占用合理（无内存泄漏）

---

*文档创建时间*: 2026-02-08
*适用版本*: Stratos v0.1.1
*预计总实施时间*: 2-3小时
*状态*: 待实施
