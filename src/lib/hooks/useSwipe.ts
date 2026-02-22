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