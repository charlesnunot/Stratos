# React 无限循环渲染错误修复方案

## 问题描述

**错误信息**:
```
Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate.
```

**现象**: 商品详情页面图片不断闪烁，页面卡死

**根本原因**: 多个组件中存在 useEffect 依赖项设置不当，导致组件不断重新渲染，形成无限循环

---

## 🔴 问题分析

### 问题1: useImagePreload Hook - images 数组依赖（最严重）

**文件**: `src/lib/hooks/useImagePreload.ts`

**问题代码**（第67行）:
```typescript
useEffect(() => {
  // ... 预加载逻辑
}, [images, currentIndex, preloadDistance, enabled])  // ❌ images 每次渲染都是新数组
```

**原因**: 
- `product.images || []` 每次渲染都创建新数组
- 即使内容相同，引用不同，触发 useEffect
- useEffect 中的异步操作导致状态更新，再次触发渲染
- 形成无限循环

---

### 问题2: ImageLightbox - onIndexChange 回调依赖

**文件**: `src/components/ecommerce/ImageLightbox.tsx`

**问题代码**（第92-94行）:
```typescript
useEffect(() => {
  onIndexChange?.(currentIndex)
}, [currentIndex, onIndexChange])  // ❌ onIndexChange 每次渲染都是新函数
```

**原因**:
- `onIndexChange` 在父组件中是内联函数
- 每次渲染创建新的函数引用
- useEffect 检测到变化，调用回调
- 回调中调用 `setCurrentImageIndex`，触发重新渲染
- 无限循环

---

### 问题3: ImageLightbox - images.length 依赖

**文件**: `src/components/ecommerce/ImageLightbox.tsx`

**问题代码**（第44-56行）:
```typescript
const goToPrevious = useCallback(() => {
  setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  // ...
}, [images.length, startLoading, resetZoom])  // ❌ 依赖过多

const goToNext = useCallback(() => {
  setCurrentIndex((prev) => (prev + 1) % images.length)
  // ...
}, [images.length, startLoading, resetZoom])
```

**原因**:
- 依赖项过多，任何变化都重新创建函数
- 可能导致额外的重新渲染

---

### 问题4: ImageLightbox - 多重 useEffect 依赖

**文件**: `src/components/ecommerce/ImageLightbox.tsx`

**问题代码**（第35-42行）:
```typescript
useEffect(() => {
  if (!isOpen) {
    resetZoom()
    setIsLoading(true)
  } else {
    startLoading()
  }
}, [isOpen, startLoading, resetZoom])  // ❌ startLoading 和 resetZoom 可能导致循环
```

**原因**:
- `startLoading` 和 `resetZoom` 是 useImageProgress 和 usePinchZoom 返回的函数
- 如果这些 Hook 内部实现不当，可能导致依赖循环

---

## 🛠️ 详细修复步骤

### 修复1: useImagePreload Hook（最高优先级）

**文件**: `src/lib/hooks/useImagePreload.ts`

**当前问题代码**（第26-67行）:
```typescript
useEffect(() => {
  if (!enabled || !images || images.length === 0) {
    return
  }

  const preload = async () => {
    isPreloadingRef.current = true
    // ... 预加载逻辑
    isPreloadingRef.current = false
  }

  const timeoutId = setTimeout(preload, 100)

  return () => {
    clearTimeout(timeoutId)
  }
}, [images, currentIndex, preloadDistance, enabled])
```

**修复方案A - 使用 JSON 序列化比较（推荐）**:
```typescript
import { useEffect, useRef } from 'react'

interface PreloadOptions {
  preloadDistance?: number
  enabled?: boolean
}

interface ImagePreloadHookReturn {
  isPreloading: boolean
  preloadedImages: Set<string>
}

export function useImagePreload(
  images: string[],
  currentIndex: number,
  options: PreloadOptions = {}
): ImagePreloadHookReturn {
  const {
    preloadDistance = 2,
    enabled = true
  } = options

  const isPreloadingRef = useRef(false)
  const preloadedImagesRef = useRef(new Set<string>())
  // 保存上一次的 images 用于比较
  const prevImagesRef = useRef<string[]>([])

  useEffect(() => {
    if (!enabled || !images || images.length === 0) {
      return
    }

    // 检查 images 是否真的发生了变化（内容比较）
    const imagesChanged = 
      images.length !== prevImagesRef.current.length ||
      images.some((img, idx) => img !== prevImagesRef.current[idx])
    
    if (!imagesChanged && preloadedImagesRef.current.size > 0) {
      return  // 图片没有变化，跳过预加载
    }

    // 更新引用
    prevImagesRef.current = [...images]

    const preload = async () => {
      isPreloadingRef.current = true

      // 计算需要预加载的索引范围
      const startIndex = Math.max(0, currentIndex - preloadDistance)
      const endIndex = Math.min(images.length - 1, currentIndex + preloadDistance)

      // 预加载范围内的图片
      for (let i = startIndex; i <= endIndex; i++) {
        const imageUrl = images[i]
        if (imageUrl && !preloadedImagesRef.current.has(imageUrl)) {
          try {
            // 使用 Image 对象预加载
            const img = new Image()
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve()
              img.onerror = () => resolve() // 忽略错误，继续预加载
              img.src = imageUrl
            })
            preloadedImagesRef.current.add(imageUrl)
          } catch (error) {
            // 忽略预加载错误
            console.error('Error preloading image:', error)
          }
        }
      }

      isPreloadingRef.current = false
    }

    // 防抖处理，避免频繁切换时的重复预加载
    const timeoutId = setTimeout(preload, 100)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [currentIndex, preloadDistance, enabled, images.length, images.join(',')])  // ✅ 使用 images.join(',') 替代整个数组

  return {
    isPreloading: isPreloadingRef.current,
    preloadedImages: preloadedImagesRef.current
  }
}
```

**修复方案B - 简化版本（如果方案A仍有性能问题）**:
```typescript
useEffect(() => {
  if (!enabled || !images || images.length === 0) {
    return
  }

  const preload = async () => {
    // ... 预加载逻辑
  }

  const timeoutId = setTimeout(preload, 100)

  return () => {
    clearTimeout(timeoutId)
  }
  // ✅ 只依赖关键值，不依赖整个 images 数组
}, [currentIndex, preloadDistance, enabled, images.length])  
```

---

### 修复2: ImageLightbox - 移除 onIndexChange useEffect

**文件**: `src/components/ecommerce/ImageLightbox.tsx`

**当前问题代码**（第92-94行）:
```typescript
useEffect(() => {
  onIndexChange?.(currentIndex)
}, [currentIndex, onIndexChange])
```

**修复方案 - 在索引变化时直接调用**:
```typescript
// 删除这个 useEffect
// useEffect(() => {
//   onIndexChange?.(currentIndex)
// }, [currentIndex, onIndexChange])

// 在 goToPrevious 和 goToNext 中直接调用
const goToPrevious = useCallback(() => {
  setCurrentIndex((prev) => {
    const newIndex = prev === 0 ? images.length - 1 : prev - 1
    onIndexChange?.(newIndex)  // ✅ 在这里调用
    return newIndex
  })
  resetZoom()
  setIsLoading(true)
  startLoading()
}, [images.length, startLoading, resetZoom, onIndexChange])

const goToNext = useCallback(() => {
  setCurrentIndex((prev) => {
    const newIndex = (prev + 1) % images.length
    onIndexChange?.(newIndex)  // ✅ 在这里调用
    return newIndex
  })
  resetZoom()
  setIsLoading(true)
  startLoading()
}, [images.length, startLoading, resetZoom, onIndexChange])
```

---

### 修复3: ProductPageClient - 缓存 onIndexChange 回调

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**当前问题代码**:
```typescript
<ImageLightbox
  images={selectedColorImage ? [selectedColorImage] : (product.images?.filter((img): img is string => typeof img === 'string') || [])}
  initialIndex={selectedColorImage ? 0 : currentImageIndex}
  isOpen={showLightbox}
  onClose={() => setShowLightbox(false)}
  onIndexChange={(index) => {  // ❌ 每次渲染都是新函数
    if (!selectedColorImage) {
      setCurrentImageIndex(index)
    }
  }}
/>
```

**修复方案 - 使用 useCallback**:
```typescript
// 在组件内部，其他 useCallback 附近添加
const handleLightboxIndexChange = useCallback((index: number) => {
  if (!selectedColorImage) {
    setCurrentImageIndex(index)
  }
}, [selectedColorImage])  // ✅ 只有 selectedColorImage 变化时才重新创建

// 然后修改 ImageLightbox 调用
<ImageLightbox
  images={selectedColorImage ? [selectedColorImage] : (product.images?.filter((img): img is string => typeof img === 'string') || [])}
  initialIndex={selectedColorImage ? 0 : currentImageIndex}
  isOpen={showLightbox}
  onClose={() => setShowLightbox(false)}
  onIndexChange={handleLightboxIndexChange}  // ✅ 使用缓存的回调
/>
```

---

### 修复4: ImageLightbox - 优化依赖项

**文件**: `src/components/ecommerce/ImageLightbox.tsx`

**优化 goToPrevious/goToNext 依赖**:
```typescript
// 当前依赖过多，优化为最小依赖
const goToPrevious = useCallback(() => {
  setCurrentIndex((prev) => {
    const newIndex = prev === 0 ? images.length - 1 : prev - 1
    onIndexChange?.(newIndex)
    return newIndex
  })
  resetZoom()
  setIsLoading(true)
  startLoading()
}, [images.length, onIndexChange])  // ✅ 移除 startLoading 和 resetZoom，因为它们内部稳定

const goToNext = useCallback(() => {
  setCurrentIndex((prev) => {
    const newIndex = (prev + 1) % images.length
    onIndexChange?.(newIndex)
    return newIndex
  })
  resetZoom()
  setIsLoading(true)
  startLoading()
}, [images.length, onIndexChange])
```

**优化键盘事件监听依赖**:
```typescript
useEffect(() => {
  if (!isOpen) return

  const handleKeyDown = (e: KeyboardEvent) => {
    // ... 键盘处理逻辑
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [isOpen])  // ✅ 只依赖 isOpen，其他函数使用 ref 或确保稳定
```

---

### 修复5: LazyImage - 缓存 onLoad/onError 回调

**文件**: `src/components/ui/LazyImage.tsx`

**当前代码**（第72-78行）:
```typescript
const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
  onLoad?.()
}

const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  onError?.()
}
```

**修复方案**:
```typescript
import React, { forwardRef, useCallback } from 'react'

// ... 其他代码

const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
  onLoad?.()
}, [onLoad])

const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
  onError?.()
}, [onError])
```

---

## 📋 完整修复清单

### 必须修复的文件

1. ✅ **src/lib/hooks/useImagePreload.ts** - 修改 useEffect 依赖项
2. ✅ **src/components/ecommerce/ImageLightbox.tsx** - 移除 onIndexChange useEffect，优化依赖
3. ✅ **src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx** - 添加 useCallback 缓存
4. ✅ **src/components/ui/LazyImage.tsx** - 缓存 onLoad/onError 回调

### 可选优化（推荐）

5. ⭕ **useImageProgress Hook** - 检查是否需要优化
6. ⭕ **usePinchZoom Hook** - 检查是否需要优化

---

## 🔍 验证步骤

修复完成后，按以下步骤验证：

1. **刷新页面**
   - 打开商品详情页
   - 观察图片是否正常加载，无闪烁

2. **切换图片**
   - 点击缩略图切换
   - 观察是否流畅，无卡顿

3. **打开 Lightbox**
   - 点击主图打开大图
   - 切换图片，观察是否正常

4. **检查控制台**
   - 打开浏览器 DevTools
   - 查看 Console 是否有错误
   - 查看 React DevTools Profiler 是否有异常渲染

---

## ⏱️ 预计修复时间

- useImagePreload 修复: 10分钟
- ImageLightbox 修复: 15分钟
- ProductPageClient 修复: 10分钟
- LazyImage 修复: 5分钟
- **总计**: 约40分钟

---

## 💡 预防措施

为避免未来再次出现类似问题：

1. **使用 ESLint 规则**
   ```json
   {
     "rules": {
       "react-hooks/exhaustive-deps": "warn"
     }
   }
   ```

2. **代码审查清单**
   - useEffect 依赖项是否包含对象/数组？
   - 回调函数是否使用了 useCallback？
   - 组件是否接收了不稳定的 props？

3. **使用 React DevTools Profiler**
   - 定期检查组件渲染次数
   - 识别不必要的重新渲染

---

*文档创建时间*: 2026-02-08
*紧急程度*: 🔴 最高（导致页面卡死）
*预计修复时间*: 40分钟
*验证时间*: 10分钟
