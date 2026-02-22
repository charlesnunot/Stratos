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
