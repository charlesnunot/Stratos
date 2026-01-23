'use client'

import { useState, useEffect, useMemo } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { NotificationList } from './NotificationList'

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showList, setShowList] = useState(false)
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!user) return

    // Load unread count
    const loadUnreadCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      setUnreadCount(count || 0)
    }

    loadUnreadCount()

    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUnreadCount()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [user, supabase])

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowList(!showList)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>
      {showList && (
        <div className="absolute right-0 top-12 z-50 w-80">
          <NotificationList onClose={() => setShowList(false)} />
        </div>
      )}
    </div>
  )
}
