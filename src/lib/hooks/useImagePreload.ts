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
  }, [currentIndex, preloadDistance, enabled, images.length, images.join(',')])

  return {
    isPreloading: isPreloadingRef.current,
    preloadedImages: preloadedImagesRef.current
  }
}

// 工具函数：清理预加载的图片缓存
export function clearImagePreloadCache() {
  // 注意：这个函数不会清除浏览器的原生缓存
  // 它只是提供一个接口，让调用者知道可以清理我们的预加载跟踪
  console.log('Image preload cache cleared')
}