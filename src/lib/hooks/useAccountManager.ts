/**
 * Hook: useAccountManager
 * Get seller's assigned account manager
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface AccountManager {
  id: string
  name: string
  email: string
  phone?: string
  avatar_url?: string
  title?: string
  working_hours?: string
  languages?: string[]
}

interface AccountManagerAssignment {
  hasManager: boolean
  manager?: AccountManager
  assignment?: {
    assigned_at: string
    last_contact_at?: string
  }
}

export function useAccountManager(userId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['accountManager', userId],
    queryFn: async (): Promise<AccountManagerAssignment | null> => {
      if (!userId) return null

      const { data, error } = await supabase
        .from('seller_account_manager_view')
        .select('*')
        .eq('seller_id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return { hasManager: false }
        }
        console.error('[useAccountManager] Error:', error)
        return null
      }

      if (!data?.manager_id) {
        return { hasManager: false }
      }

      return {
        hasManager: true,
        manager: {
          id: data.manager_id,
          name: data.manager_name,
          email: data.manager_email,
          phone: data.manager_phone,
          avatar_url: data.manager_avatar,
          title: data.manager_title,
          working_hours: data.working_hours,
          languages: data.languages,
        },
        assignment: {
          assigned_at: data.assigned_at,
          last_contact_at: data.last_contact_at,
        },
      }
    },
    enabled: !!userId,
  })
}

/**
 * Hook: useAccountManagerStats (for admin)
 */
export function useAccountManagerStats() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['accountManagerStats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_manager_stats')
        .select('*')
        .order('current_clients', { ascending: false })

      if (error) {
        console.error('[useAccountManagerStats] Error:', error)
        return []
      }

      return data || []
    },
  })
}

/**
 * Check if seller is eligible for account manager (Scale tier)
 */
export function useScaleTierCheck(userId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['scaleTierCheck', userId],
    queryFn: async (): Promise<boolean> => {
      if (!userId) return false

      const { data, error } = await supabase
        .from('subscriptions')
        .select('subscription_tier')
        .eq('user_id', userId)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        return false
      }

      return data.subscription_tier === 100
    },
    enabled: !!userId,
  })
}
