'use client'

import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
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
  const locale = useLocale()
  const t = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const tNotifications = useTranslations('notifications')
  const tContent = useTranslations('notifications.content')

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
      if (!user?.id) return
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
        .eq('user_id', user.id)

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
    // 举报通知：统一跳转到举报列表并定位到本条（带 reportId，无歧义）
    if (notification.type === 'report' && notification.related_id) {
      return `/admin/reports?reportId=${encodeURIComponent(notification.related_id)}`
    }
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
      return tNotifications('linkText.viewReport')
    }
    
    return null
  }

  // Resolve notification body: prefer content_key + content_params (i18n), fallback to content (legacy)
  const renderNotificationContent = (notification: any) => {
    const params = (notification.content_params ?? {}) as Record<string, string | number>
    const repostComment = params.repostComment as string | undefined

    // i18n path: content_key set
    if (notification.content_key) {
      const resolvedParams = { ...params }
      if (notification.actor && (notification.actor.display_name || notification.actor.username)) {
        resolvedParams.actorName = notification.actor.display_name || notification.actor.username || (params.actorName as string) || ''
      }
      if (notification.content_key === 'report_content' && typeof params.reportedType === 'string') {
        try {
          resolvedParams.reportedType = tNotifications(`reportedTypes.${params.reportedType}`)
        } catch {
          resolvedParams.reportedType = params.reportedType
        }
      }
      let actionText: string
      try {
        actionText = tContent(notification.content_key, resolvedParams)
      } catch {
        actionText = notification.content ?? ''
      }
      const actorName =
        notification.actor?.display_name || notification.actor?.username || (params.actorName as string) || ''

      // Repost with optional comment: main line + quoted repostComment
      if (repostComment != null && repostComment !== '') {
        return (
          <div className="mt-1 space-y-1">
            <p className="text-xs text-muted-foreground">
              {notification.actor_id && actorName ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/profile/${notification.actor_id}`)
                    }}
                    className="text-primary hover:underline font-medium"
                  >
                    {actorName}
                  </button>
                  {' '}
                </>
              ) : null}
              {actionText}
            </p>
            <p className="text-xs italic text-muted-foreground/80 pl-4 border-l-2 border-muted">
              &quot;{repostComment}&quot;
            </p>
          </div>
        )
      }

      // With actor: clickable name + action
      if (notification.actor_id && actorName) {
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

      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {actionText}
        </p>
      )
    }

    // Legacy path: no content_key, use content (e.g. Chinese from triggers)
    if (!notification.content) return null

    if (notification.type === 'repost' && notification.content.includes('：')) {
      const parts = notification.content.split('：', 2)
      const baseContent = parts[0]
      const commentPart = parts[1]
      const actorName = notification.actor?.display_name || notification.actor?.username || '某用户'
      const actionText = baseContent.replace(/^.+?\s+/, '')

      return (
        <div className="mt-1 space-y-1">
          <p className="text-xs text-muted-foreground">
            {notification.actor && notification.actor_id ? (
              <>
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
              </>
            ) : (
              baseContent
            )}
          </p>
          {commentPart && (
            <p className="text-xs italic text-muted-foreground/80 pl-4 border-l-2 border-muted">
              &quot;{commentPart}&quot;
            </p>
          )}
        </div>
      )
    }

    if (notification.actor && notification.actor_id) {
      const actorName = notification.actor.display_name || notification.actor.username || '某用户'
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
                  {new Date(notification.created_at).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                </p>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
