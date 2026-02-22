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

  // 添加手动缩放函数
  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.5, 3))
  }, [])

  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.5, 1))
  }, [])

  return { scale, onTouchStart, onTouchMove, onTouchEnd, resetZoom, zoomIn, zoomOut }
}
