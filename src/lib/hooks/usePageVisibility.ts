'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to detect page visibility
 * Returns true when page is visible, false when hidden
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return true
    return !document.hidden
  })

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return isVisible
}
