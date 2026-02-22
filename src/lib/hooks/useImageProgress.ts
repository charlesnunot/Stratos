import { useState, useCallback } from 'react'

export function useImageProgress() {
  const [progress, setProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const startLoading = useCallback(() => {
    setIsLoading(true)
    setProgress(0)
  }, [])

  const updateProgress = useCallback((percent: number) => {
    setProgress(percent)
  }, [])

  const finishLoading = useCallback(() => {
    setProgress(100)
    setTimeout(() => {
      setIsLoading(false)
      setProgress(0)
    }, 300)
  }, [])

  return { progress, isLoading, startLoading, updateProgress, finishLoading }
}
