'use client'

import React, { useState, useEffect, useRef } from 'react'

interface SimpleLazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt?: string
  className?: string
}

export function SimpleLazyImage({ src, alt = '', className, ...props }: SimpleLazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '50px',
        threshold: 0.01
      }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // 重置加载状态当 src 变化
  useEffect(() => {
    setIsLoaded(false)
  }, [src])

  return (
    <div ref={imgRef} className={`relative bg-muted ${className || ''}`}>
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
          {...props}
        />
      )}
    </div>
  )
}
