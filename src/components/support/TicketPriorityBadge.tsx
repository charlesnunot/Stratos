'use client'

import { Badge } from '@/components/ui/badge'
import { Clock, Zap, Crown } from 'lucide-react'
import { getPriorityColor, getPriorityLabel } from '@/lib/hooks/useSupportPriority'

interface TicketPriorityBadgeProps {
  priorityLevel: 'standard' | 'priority' | 'vip'
  slaHours?: number
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function TicketPriorityBadge({
  priorityLevel,
  slaHours,
  showIcon = true,
  size = 'md',
}: TicketPriorityBadgeProps) {
  const colorClass = getPriorityColor(priorityLevel)
  const label = getPriorityLabel(priorityLevel)

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-0.5',
    lg: 'text-base px-3 py-1',
  }

  const iconSize = {
    sm: 12,
    md: 14,
    lg: 16,
  }

  const getIcon = () => {
    switch (priorityLevel) {
      case 'vip':
        return <Crown size={iconSize[size]} className="mr-1" />
      case 'priority':
        return <Zap size={iconSize[size]} className="mr-1" />
      case 'standard':
      default:
        return <Clock size={iconSize[size]} className="mr-1" />
    }
  }

  return (
    <Badge
      variant="outline"
      className={`${colorClass} ${sizeClasses[size]} font-medium`}
    >
      {showIcon && getIcon()}
      {slaHours ? `${label}` : label}
    </Badge>
  )
}
