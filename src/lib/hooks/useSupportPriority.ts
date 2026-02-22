/**
 * Hook: useSupportPriority
 * Get user's support priority level based on subscription tier
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface SupportPriority {
  priority_level: 'standard' | 'priority' | 'vip'
  sla_hours: number
  tier_name: string
}

export function useSupportPriority(userId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['supportPriority', userId],
    queryFn: async (): Promise<SupportPriority | null> => {
      if (!userId) return null

      const { data, error } = await supabase
        .rpc('get_user_support_priority', {
          p_user_id: userId,
        })
        .single()

      if (error) {
        console.error('[useSupportPriority] Error:', error)
        return null
      }

      return data as SupportPriority
    },
    enabled: !!userId,
  })
}

/**
 * Hook: useTicketSLA
 * Get SLA information for a specific ticket
 */
export function useTicketSLA(ticketId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['ticketSLA', ticketId],
    queryFn: async () => {
      if (!ticketId) return null

      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          id,
          priority_level,
          sla_hours,
          response_deadline,
          first_response_at,
          is_sla_breached,
          created_at
        `)
        .eq('id', ticketId)
        .single()

      if (error) {
        console.error('[useTicketSLA] Error:', error)
        return null
      }

      // Calculate time remaining
      const now = new Date()
      const deadline = data.response_deadline ? new Date(data.response_deadline) : null
      const timeRemaining = deadline ? deadline.getTime() - now.getTime() : null

      return {
        ...data,
        time_remaining_ms: timeRemaining,
        time_remaining_hours: timeRemaining ? Math.ceil(timeRemaining / (1000 * 60 * 60)) : null,
        time_remaining_minutes: timeRemaining ? Math.ceil(timeRemaining / (1000 * 60)) : null,
        is_urgent: timeRemaining !== null && timeRemaining < 1000 * 60 * 60, // Less than 1 hour
        is_overdue: timeRemaining !== null && timeRemaining < 0,
      }
    },
    enabled: !!ticketId,
    refetchInterval: 60000, // Refetch every minute to update countdown
  })
}

/**
 * Get priority badge color
 */
export function getPriorityColor(priorityLevel: string): string {
  switch (priorityLevel) {
    case 'vip':
      return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'priority':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'standard':
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

/**
 * Get priority label
 */
export function getPriorityLabel(priorityLevel: string): string {
  switch (priorityLevel) {
    case 'vip':
      return 'VIP (2小时)'
    case 'priority':
      return '优先 (6小时)'
    case 'standard':
    default:
      return '标准 (24小时)'
  }
}
