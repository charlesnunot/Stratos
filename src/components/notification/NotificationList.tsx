'use client'

import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { useRouter } from '@/i18n/navigation'

interface NotificationListProps {
  onClose: () => void
  isFullPage?: boolean
}

export function NotificationList({ onClose, isFullPage = false }: NotificationListProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const tNotifications = useTranslations('notifications')

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          actor:profiles!notifications_actor_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, supabase, queryClient])

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user) return
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
    },
  })

  const getNotificationLink = (notification: any) => {
    // 优先使用数据库中的 link 字段
    if (notification.link) return notification.link
    
    // 基于 type 和 related_type 生成链接
    if (notification.type === 'system') {
      if (notification.related_type === 'user' && notification.related_id) {
        return `/profile/${notification.related_id}/edit`
      }
      if (notification.related_type === 'post' && notification.related_id) {
        return `/post/${notification.related_id}`
      }
      if (notification.related_type === 'product' && notification.related_id) {
        return `/product/${notification.related_id}`
      }
    }
    
    if (notification.type === 'commission') {
      if (notification.related_id) {
        return `/affiliate/commissions?order=${notification.related_id}`
      }
      return `/affiliate/commissions`
    }
    
    if (notification.type === 'order' && notification.related_type === 'order' && notification.related_id) {
      return `/orders/${notification.related_id}`
    }
    
    if (notification.type === 'follow' && notification.related_id) {
      return `/profile/${notification.related_id}`
    }
    
    if (notification.type === 'like' && notification.related_id) {
      return `/post/${notification.related_id}`
    }
    
    if (notification.type === 'comment' && notification.related_id) {
      return `/post/${notification.related_id}`
    }
    
    if (notification.type === 'favorite' && notification.related_id) {
      if (notification.related_type === 'post') {
        return `/post/${notification.related_id}`
      }
      if (notification.related_type === 'product') {
        return `/product/${notification.related_id}`
      }
      if (notification.related_type === 'user') {
        return `/profile/${notification.related_id}`
      }
    }
    
    if (notification.type === 'share' && notification.related_id) {
      if (notification.related_type === 'post') {
        return `/post/${notification.related_id}`
      }
      if (notification.related_type === 'product') {
        return `/product/${notification.related_id}`
      }
    }
    
    if (notification.type === 'repost' && notification.related_id) {
      // 转发通知：优先使用数据库中的 link 字段，如果没有则根据 related_type 生成
      if (notification.link) {
        return notification.link
      }
      // Fallback：根据 related_type 生成链接
      if (notification.related_type === 'post') {
        return `/post/${notification.related_id}`
      }
      if (notification.related_type === 'product') {
        return `/product/${notification.related_id}`
      }
    }
    
    if (notification.type === 'want' && notification.related_id) {
      // 商品"想要"通知：优先使用数据库中的 link 字段，如果没有则根据 related_type 生成
      if (notification.link) {
        return notification.link
      }
      // Fallback：根据 related_type 生成链接
      if (notification.related_type === 'product') {
        return `/product/${notification.related_id}`
      }
    }
    
    if (notification.type === 'report' && notification.related_id) {
      // 举报通知链接到管理后台的举报管理页面
      return '/admin/reports'
    }
    
    return null
  }

  const getNotificationLinkText = (notification: any) => {
    // 根据通知类型返回链接文本
    if (notification.type === 'system') {
      if (notification.related_type === 'user') {
        return tNotifications('linkText.completeProfile')
      }
      if (notification.related_type === 'post') {
        return tNotifications('linkText.viewPost')
      }
      if (notification.related_type === 'product') {
        return tNotifications('linkText.viewPost')
      }
      // 群组通知
      if (notification.title.includes('群组')) {
        return tNotifications('linkText.viewGroup')
      }
      // 订阅通知
      if (notification.title.includes('订阅')) {
        return tNotifications('linkText.viewSubscription')
      }
      // 保证金通知
      if (notification.title.includes('保证金')) {
        return tNotifications('linkText.payDeposit')
      }
    }
    
    if (notification.type === 'commission') {
      return tNotifications('linkText.viewCommission')
    }
    
    if (notification.type === 'order') {
      return tNotifications('linkText.viewOrder')
    }
    
    if (notification.type === 'follow') {
      return tNotifications('linkText.viewUser')
    }
    
    if (notification.type === 'like' || notification.type === 'comment' || notification.type === 'repost' || notification.type === 'share') {
      return tNotifications('linkText.viewPost')
    }
    
    if (notification.type === 'favorite') {
      if (notification.related_type === 'post') {
        return tNotifications('linkText.viewPost')
      }
      if (notification.related_type === 'product') {
        return tNotifications('linkText.viewProduct')
      }
      if (notification.related_type === 'user') {
        return tNotifications('linkText.viewUser')
      }
    }
    
    if (notification.type === 'want') {
      if (notification.related_type === 'product') {
        return tNotifications('linkText.viewProduct')
      }
    }
    
    if (notification.type === 'report') {
      return '查看举报'
    }
    
    return null
  }

  // 解析通知内容，使用 actor 数据渲染可点击用户名
  const renderNotificationContent = (notification: any) => {
    if (!notification.content) return null
    
    // 特殊处理转发通知：如果有转发评论，单独显示
    if (notification.type === 'repost' && notification.content.includes('：')) {
      const parts = notification.content.split('：', 2)
      const baseContent = parts[0] // 基本内容："某用户 向您转发了帖子"
      const repostComment = parts[1] // 转发评论
      
      if (notification.actor && notification.actor_id) {
        const actorName = notification.actor.display_name || notification.actor.username || '某用户'
        // 从 baseContent 中提取动作部分（去掉用户名）
        const actionText = baseContent.replace(/^.+?\s+/, '')
        
        return (
          <div className="mt-1 space-y-1">
            <p className="text-xs text-muted-foreground">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/profile/${notification.actor_id}`)
                }}
                className="text-primary hover:underline font-medium"
              >
                {actorName}
              </button>
              {' ' + actionText}
            </p>
            {repostComment && (
              <p className="text-xs italic text-muted-foreground/80 pl-4 border-l-2 border-muted">
                "{repostComment}"
              </p>
            )}
          </div>
        )
      } else {
        // 如果没有 actor 信息，显示纯文本
        return (
          <div className="mt-1 space-y-1">
            <p className="text-xs text-muted-foreground">{baseContent}</p>
            {repostComment && (
              <p className="text-xs italic text-muted-foreground/80 pl-4 border-l-2 border-muted">
                "{repostComment}"
              </p>
            )}
          </div>
        )
      }
    }
    
    // 方案 A：如果通知有 actor 信息，直接使用 actor 数据渲染
    if (notification.actor && notification.actor_id) {
      const actorName = notification.actor.display_name || notification.actor.username || '某用户'
      // 从 content 中提取动作部分（去掉用户名）
      // 例如："张三 点赞了您的帖子" -> "点赞了您的帖子"
      const actionText = notification.content.replace(/^.+?\s+/, '')
      
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          <button
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/profile/${notification.actor_id}`)
            }}
            className="text-primary hover:underline font-medium"
          >
            {actorName}
          </button>
          {' ' + actionText}
        </p>
      )
    }
    
    // 如果没有 actor 信息，显示纯文本（向后兼容旧通知）
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {notification.content}
      </p>
    )
  }

  return (
    <Card className={`${isFullPage ? 'w-full' : 'max-h-96 w-80'} overflow-y-auto p-4`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{t('notificationsTitle')}</h3>
        <div className="flex items-center gap-3">
          {notifications.some((n) => !n.is_read) && (
            <button
              onClick={() => markAllAsReadMutation.mutate()}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={!user || markAllAsReadMutation.isPending}
            >
              {tNotifications('markAllAsRead')}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {tCommon('close')}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {notifications.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('noNotifications')}
          </p>
        ) : (
          notifications.map((notification) => {
            const link = getNotificationLink(notification)
            const linkText = getNotificationLinkText(notification)
            return (
              <div
                key={notification.id}
                className={`rounded-lg p-3 transition-colors ${
                  !notification.is_read ? 'bg-muted' : ''
                }`}
                onClick={() => {
                  if (!notification.is_read) {
                    markAsReadMutation.mutate(notification.id)
                  }
                }}
              >
                <p className="text-sm font-semibold">{notification.title}</p>
                {renderNotificationContent(notification)}
                {link && linkText && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!notification.is_read) {
                        markAsReadMutation.mutate(notification.id)
                      }
                      onClose()
                      router.push(link)
                    }}
                    className="mt-1 text-xs text-primary hover:underline cursor-pointer"
                  >
                    {linkText}
                  </button>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(notification.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
