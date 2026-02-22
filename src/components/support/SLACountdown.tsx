'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Clock, CheckCircle } from 'lucide-react'

interface SLACountdownProps {
  deadline: string | null
  firstResponseAt: string | null
  isBreached: boolean
  slaHours: number
}

export function SLACountdown({
  deadline,
  firstResponseAt,
  isBreached,
  slaHours,
}: SLACountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (firstResponseAt || !deadline) return

    const calculateTimeRemaining = () => {
      const now = new Date().getTime()
      const deadlineTime = new Date(deadline).getTime()
      return deadlineTime - now
    }

    setTimeRemaining(calculateTimeRemaining())

    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [deadline, firstResponseAt])

  // Already responded
  if (firstResponseAt) {
    return (
      <div className="flex items-center text-green-600 text-sm">
        <CheckCircle size={16} className="mr-1.5" />
        <span>已响应</span>
      </div>
    )
  }

  // SLA breached
  if (isBreached) {
    return (
      <div className="flex items-center text-red-600 text-sm font-medium">
        <AlertCircle size={16} className="mr-1.5" />
        <span>已超时</span>
      </div>
    )
  }

  // No deadline
  if (!deadline || timeRemaining === null) {
    return (
      <div className="flex items-center text-gray-500 text-sm">
        <Clock size={16} className="mr-1.5" />
        <span>{slaHours}小时内响应</span>
      </div>
    )
  }

  // Calculate display
  const hours = Math.floor(timeRemaining / (1000 * 60 * 60))
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60))

  const isUrgent = timeRemaining < 1000 * 60 * 60 // Less than 1 hour
  const isWarning = timeRemaining < 1000 * 60 * 60 * 2 // Less than 2 hours

  const colorClass = isUrgent
    ? 'text-red-600 font-bold'
    : isWarning
    ? 'text-orange-600 font-medium'
    : 'text-blue-600'

  return (
    <div className={`flex items-center text-sm ${colorClass}`}>
      <Clock size={16} className="mr-1.5" />
      <span>
        {hours > 0 ? `${hours}小时` : ''}
        {minutes}分钟内响应
      </span>
    </div>
  )
}
