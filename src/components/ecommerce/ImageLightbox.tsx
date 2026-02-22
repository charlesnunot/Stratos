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

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  useEffect(() => {
    if (!isOpen) {
      setScale(1)
    }
  }, [isOpen])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      const newIndex = prev === 0 ? images.length - 1 : prev - 1
      onIndexChange?.(newIndex)
      return newIndex
    })
    setScale(1)
  }, [images.length, onIndexChange])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const newIndex = (prev + 1) % images.length
      onIndexChange?.(newIndex)
      return newIndex
    })
    setScale(1)
  }, [images.length, onIndexChange])

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.5, 3))
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.5, 1))

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
          zoomIn()
          break
        case '-':
          zoomOut()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, goToPrevious, goToNext])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          {/* 缩放控制 */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9"
            onClick={zoomOut}
            disabled={scale <= 1}
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="text-sm min-w-[50px] text-center">{Math.round(scale * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9"
            onClick={zoomIn}
            disabled={scale >= 3}
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
          {/* 关闭按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9 ml-2"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* 图片显示区域 */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* 图片 */}
        <img
          src={images[currentIndex]}
          alt={`图片 ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain transition-transform duration-200 cursor-pointer"
          style={{ transform: `scale(${scale})` }}
          onClick={(e) => {
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
        <div className="px-4 py-3 bg-black/80 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentIndex(index)
                  onIndexChange?.(index)
                  setScale(1)
                }}
                className={cn(
                  "flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all bg-gray-800",
                  currentIndex === index
                    ? "border-white opacity-100"
                    : "border-transparent opacity-50 hover:opacity-80"
                )}
              >
                <img
                  src={image}
                  alt={`缩略图 ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
