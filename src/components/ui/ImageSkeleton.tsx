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
