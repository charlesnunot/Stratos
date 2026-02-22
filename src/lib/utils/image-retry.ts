/**
 * 图片加载重试工具
 * 处理图片加载失败后的重试逻辑
 */

export interface ImageRetryOptions {
  maxRetries?: number      // 最大重试次数，默认 3
  retryDelay?: number      // 重试间隔(ms)，默认 1000
  fallbackSrc?: string     // 兜底图路径
}

export const DEFAULT_RETRY_OPTIONS: ImageRetryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  fallbackSrc: '/placeholder-product.png',
}

/**
 * 创建图片错误处理函数
 * 用于 img 标签的 onError 事件
 * 
 * 设计原则：
 * - Stateless：不依赖 React 状态
 * - Self-contained：所有状态存在 DOM dataset
 * - Safe：自动处理 src 变化，防止死循环
 */
export function createImageErrorHandler(
  options: ImageRetryOptions = {}
): (e: React.SyntheticEvent<HTMLImageElement>) => void {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    fallbackSrc = '/placeholder-product.png',
  } = options

  const debug = process.env.NODE_ENV === 'development'

  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget

    // Guard 1: 防止 fallback 图触发死循环
    if (img.src === fallbackSrc) return

    // 获取当前实际 src（不是闭包里的旧值）
    const currentSrc = img.currentSrc || img.src
    const baseSrc = img.dataset.baseSrc || currentSrc.split('?')[0]

    // Guard 2: src 变化时自动重置重试计数
    if (img.dataset.lastSrc !== currentSrc) {
      img.dataset.retryCount = '0'
      img.dataset.baseSrc = baseSrc
      img.dataset.lastSrc = currentSrc
    }

    const retryCount = parseInt(img.dataset.retryCount || '0', 10)

    if (retryCount < maxRetries) {
      img.dataset.retryCount = String(retryCount + 1)
      
      if (debug) {
        console.log(`[ImageRetry] Retrying ${baseSrc}, attempt ${retryCount + 1}/${maxRetries}`)
      }

      setTimeout(() => {
        img.src = baseSrc + (baseSrc.includes('?') ? '&' : '?') + `_retry=${Date.now()}`
      }, retryDelay)
    } else {
      if (debug) {
        console.log(`[ImageRetry] Failed after ${maxRetries} attempts, showing fallback`)
      }
      img.src = fallbackSrc
    }
  }
}

/**
 * 手动重置图片重试计数
 * 在明确知道需要重置时调用（如用户主动切换图片）
 */
export function resetImageRetry(img: HTMLImageElement): void {
  img.dataset.retryCount = '0'
  img.dataset.lastSrc = img.currentSrc || img.src
}
