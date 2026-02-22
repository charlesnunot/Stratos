'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ExternalLink, Trash2, Eye } from 'lucide-react'
import { showSuccess, showError } from '@/lib/utils/toast'

/** Joined content shape for comment/post/tip/message links */
interface ReportContentShape {
  post_id?: string
  conversation_id?: string
  content?: string
  name?: string
  order_number?: string
  amount?: number
  post?: { content?: string }
  [key: string]: unknown
}
/** Reported user shape for preview */
interface ReportedUserShape {
  display_name?: string
  username?: string
  [key: string]: unknown
}
interface ReportWithContent {
  id?: string
  reported_type?: string
  reported_id?: string
  reporter_id?: string
  created_at?: string
  reason?: string
  description?: string
  status?: string
  content?: ReportContentShape
  reported_user?: ReportedUserShape
  [key: string]: unknown
}

interface ReportManagementProps {
  userRole?: string
  /** 来自 URL 的 reportId，用于高亮并滚动到该条（从举报通知「查看举报」进入时传入） */
  highlightReportId?: string | null
}

const REPORT_TYPE_KEYS: Record<string, string> = {
  post: 'reportTypePost',
  product: 'reportTypeProduct',
  comment: 'reportTypeComment',
  product_comment: 'reportTypeProductComment',
  user: 'reportTypeUser',
  order: 'reportTypeOrder',
  affiliate_post: 'reportTypeAffiliatePost',
  tip: 'reportTypeTip',
  message: 'reportTypeMessage',
}

export function ReportManagement({ userRole = 'user', highlightReportId }: ReportManagementProps) {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const [reports, setReports] = useState<ReportWithContent[]>([])
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({})
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const { user } = useAuth()
  const supabase = useMemo(() => {
    if (typeof window !== 'undefined') {
      return createClient()
    }
    return null
  }, [])
  const router = useRouter()

  const isAdminOrSupport = userRole === 'admin' || userRole === 'support'

  const loadReports = useCallback(async () => {
    if (!supabase || !user) return
    
    let query = supabase
      .from('reports')
      .select('*')
    
    // 根据用户角色过滤数据
    if (isAdminOrSupport) {
      // 管理员/客服：只显示待处理的举报
      query = query.eq('status', 'pending')
    } else {
      // 普通用户：只显示自己创建的举报，显示所有状态以便查看处理结果
      query = query.eq('reporter_id', user.id)
    }
    
    const { data } = await query.order('created_at', { ascending: false })

    if (data) {
      // 加载被举报内容的详细信息
      const reportsWithContent = await Promise.all(
        data.map(async (report) => {
          let content = null
          let reported_user = null

          try {
            switch (report.reported_type) {
              case 'post':
                const { data: postData } = await supabase
                  .from('posts')
                  .select('*, user:profiles!posts_user_id_fkey(id, username, display_name)')
                  .eq('id', report.reported_id)
                  .single()
                content = postData
                reported_user = postData?.user
                break
              case 'product':
                const { data: productData } = await supabase
                  .from('products')
                  .select('*, seller:profiles!products_seller_id_fkey(id, username, display_name)')
                  .eq('id', report.reported_id)
                  .single()
                content = productData
                reported_user = productData?.seller
                break
              case 'comment':
                const { data: commentData } = await supabase
                  .from('comments')
                  .select('*, user:profiles!comments_user_id_fkey(id, username, display_name)')
                  .eq('id', report.reported_id)
                  .single()
                content = commentData
                reported_user = commentData?.user
                break
              case 'product_comment':
                const { data: productCommentData } = await supabase
                  .from('product_comments')
                  .select('*, user:profiles!product_comments_user_id_fkey(id, username, display_name)')
                  .eq('id', report.reported_id)
                  .single()
                content = productCommentData
                reported_user = productCommentData?.user
                break
              case 'user':
                const { data: userData } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', report.reported_id)
                  .single()
                reported_user = userData
                break
              case 'order':
                const { data: orderData } = await supabase
                  .from('orders')
                  .select('*, buyer:profiles!orders_buyer_id_fkey(id, username, display_name), seller:profiles!orders_seller_id_fkey(id, username, display_name)')
                  .eq('id', report.reported_id)
                  .single()
                content = orderData
                reported_user = orderData?.buyer || orderData?.seller
                break
              case 'affiliate_post':
                const { data: affiliatePostData } = await supabase
                  .from('affiliate_posts')
                  .select('*, affiliate:profiles!affiliate_posts_affiliate_id_fkey(id, username, display_name), post:posts!affiliate_posts_post_id_fkey(id, user_id)')
                  .eq('id', report.reported_id)
                  .single()
                content = affiliatePostData
                if (affiliatePostData?.post) {
                  const { data: postUser } = await supabase
                    .from('profiles')
                    .select('id, username, display_name')
                    .eq('id', affiliatePostData.post.user_id)
                    .single()
                  reported_user = affiliatePostData?.affiliate || postUser
                } else {
                  reported_user = affiliatePostData?.affiliate
                }
                break
              case 'tip':
                const { data: tipData } = await supabase
                  .from('tips')
                  .select('*, tipper:profiles!tips_tipper_id_fkey(id, username, display_name), post:posts!tips_post_id_fkey(id, user_id)')
                  .eq('id', report.reported_id)
                  .single()
                content = tipData
                if (tipData?.post) {
                  const { data: postUser } = await supabase
                    .from('profiles')
                    .select('id, username, display_name')
                    .eq('id', tipData.post.user_id)
                    .single()
                  reported_user = tipData?.tipper || postUser
                } else {
                  reported_user = tipData?.tipper
                }
                break
              case 'message':
                const { data: messageData } = await supabase
                  .from('messages')
                  .select('*, sender:profiles!messages_sender_id_fkey(id, username, display_name)')
                  .eq('id', report.reported_id)
                  .single()
                content = messageData
                reported_user = messageData?.sender
                break
            }
          } catch (error) {
            console.error(`Error loading ${report.reported_type} content:`, error)
          }

          return { ...report, content, reported_user }
        })
      )

      setReports(reportsWithContent)
    }
  }, [supabase, user, isAdminOrSupport])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  // URL 传入 highlightReportId 时：列表加载后滚动到该条并高亮
  useEffect(() => {
    if (!highlightReportId || reports.length === 0) return
    const hasMatch = reports.some((r) => r.id === highlightReportId)
    if (!hasMatch) return
    const t = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
    return () => clearTimeout(t)
  }, [highlightReportId, reports])

  const locale = (t as any).locale || 'en'

  const getReportedContentLink = (report: ReportWithContent): string | null => {
    switch (report.reported_type) {
      case 'post':
        return `/post/${report.reported_id}`
      case 'product':
        return `/product/${report.reported_id}`
      case 'comment':
        return report.content?.post_id ? `/post/${report.content.post_id}#comment-${report.reported_id}` : null
      case 'user':
        return `/profile/${report.reported_id}`
      case 'order':
        return `/orders/${report.reported_id}`
      case 'affiliate_post':
        return report.content?.post_id ? `/post/${report.content.post_id}` : null
      case 'tip':
        return report.content?.post_id ? `/post/${report.content.post_id}` : null
      case 'message':
        return report.content?.conversation_id ? `/messages/${report.content.conversation_id}` : null
      default:
        return null
    }
  }

  const getReportTypeLabel = (type: string) => {
    const key = REPORT_TYPE_KEYS[type ?? '']
    return key ? t(key) : (type || t('unknownType'))
  }

  const handleDeleteContent = async (report: ReportWithContent) => {
    if (!user) return
    if (!supabase) {
      showError(t('clientNotInitialized'))
      return
    }
    if (!report.id) {
      showError(t('invalidReport'))
      return
    }
    if (!confirm(t('confirmDeleteReport', { type: getReportTypeLabel(report.reported_type ?? '') }))) {
      return
    }

    const key = `delete-${report.id}`
    setLoading(prev => ({ ...prev, [key]: true }))

    try {
      let tableName = ''
      switch (report.reported_type) {
        case 'post':
          tableName = 'posts'
          break
        case 'product':
          tableName = 'products'
          break
        case 'comment':
          tableName = 'comments'
          break
        case 'product_comment':
          tableName = 'product_comments'
          break
        case 'order':
          showError(t('orderCannotDelete'))
          return
        case 'affiliate_post':
          tableName = 'affiliate_posts'
          break
        case 'tip':
          showError(t('tipCannotDelete'))
          return
        case 'message':
          tableName = 'messages'
          break
        case 'user':
          // 用户不能被删除，只能禁用（通过 API 使用 service role，RLS 不允许客户端直接更新他人 profile）
          const banRes = await fetch(`/api/admin/profiles/${report.reported_id}/ban`, { method: 'POST' })
          if (!banRes.ok) {
            const errBody = await banRes.json().catch(() => ({}))
            throw new Error(errBody?.error ?? t('verifyFailed'))
          }
          showSuccess(t('userBanned'))
          await handleResolve(report.id, 'resolved', true)
          await sendReportNotifications(report, 'content_deleted')
          return
      }

      if (tableName) {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', report.reported_id)

        if (error) throw error

        showSuccess(t('contentDeleted'))
        await handleResolve(report.id, 'resolved', true)
        await sendReportNotifications(report, 'content_deleted')
      }
    } catch (error: any) {
      console.error('Delete error:', error)
      showError(`${t('deleteFailed')}: ${error.message || tCommon('error')}`)
    } finally {
      setLoading(prev => {
        const newState = { ...prev }
        delete newState[key]
        return newState
      })
    }
  }

  const handleResolve = async (reportId: string, action: 'resolved' | 'rejected', skipNotification = false) => {
    if (!user) return
    if (!supabase) {
      showError(t('clientNotInitialized'))
      return
    }

    const key = `resolve-${reportId}-${action}`
    setLoading(prev => ({ ...prev, [key]: true }))

    try {
      const { data: report, error: fetchError } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single()

      if (fetchError) {
        throw fetchError
      }

      const { error: updateError } = await supabase
        .from('reports')
        .update({
          status: action,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId)

      if (updateError) {
        throw updateError
      }

      // 发送通知
      if (!skipNotification && report) {
        await sendReportNotifications(report, action)
      }

      showSuccess(action === 'resolved' ? t('reportResolved') : t('reportRejected'))
      loadReports()
    } catch (error: any) {
      console.error('Resolve error:', error)
      showError(`${t('operationFailedReport')}: ${error.message || tCommon('error')}`)
    } finally {
      setLoading(prev => {
        const newState = { ...prev }
        delete newState[key]
        return newState
      })
    }
  }

  /** 根据举报类型解析被举报人 user_id，用于发通知。优先用已加载的 report.content，避免删除内容后查不到。 */
  const getReportedUserId = async (report: any): Promise<string | null> => {
    const c = report.content
    if (!supabase) return null
    switch (report.reported_type) {
      case 'post':
        return c?.user_id ?? (await supabase.from('posts').select('user_id').eq('id', report.reported_id).single()).data?.user_id ?? null
      case 'product':
        return c?.seller_id ?? (await supabase.from('products').select('seller_id').eq('id', report.reported_id).single()).data?.seller_id ?? null
      case 'comment':
        return c?.user_id ?? (await supabase.from('comments').select('user_id').eq('id', report.reported_id).single()).data?.user_id ?? null
      case 'product_comment':
        return c?.user_id ?? (await supabase.from('product_comments').select('user_id').eq('id', report.reported_id).single()).data?.user_id ?? null
      case 'user':
        return report.reported_id ?? null
      case 'order': {
        const data = c ? (c.buyer_id ?? c.seller_id) : (await supabase.from('orders').select('buyer_id, seller_id').eq('id', report.reported_id).single()).data
        return data?.buyer_id ?? data?.seller_id ?? null
      }
      case 'affiliate_post': {
        if (c?.post?.user_id) return c.post.user_id
        if (c?.affiliate_id) return c.affiliate_id
        const { data } = await supabase.from('affiliate_posts').select('affiliate_id, post_id').eq('id', report.reported_id).single()
        if (data?.post_id) {
          const { data: postData } = await supabase.from('posts').select('user_id').eq('id', data.post_id).single()
          return postData?.user_id ?? data?.affiliate_id ?? null
        }
        return data?.affiliate_id ?? null
      }
      case 'tip': {
        if (c?.post?.user_id) return c.post.user_id
        if (c?.tipper_id) return c.tipper_id
        const { data } = await supabase.from('tips').select('tipper_id, post_id').eq('id', report.reported_id).single()
        if (data?.post_id) {
          const { data: postData } = await supabase.from('posts').select('user_id').eq('id', data.post_id).single()
          return postData?.user_id ?? data?.tipper_id ?? null
        }
        return data?.tipper_id ?? null
      }
      case 'message': {
        if (c?.sender_id) return c.sender_id
        const { data } = await supabase.from('messages').select('sender_id, conversation_id').eq('id', report.reported_id).single()
        if (data?.conversation_id) {
          const { data: conv } = await supabase.from('conversations').select('participant1_id, participant2_id').eq('id', data.conversation_id).single()
          return conv?.participant1_id === data.sender_id ? conv?.participant2_id ?? null : conv?.participant1_id ?? null
        }
        return data?.sender_id ?? null
      }
      default:
        return null
    }
  }

  /** Send report result notifications via admin API (RLS only allows inserting for self). */
  const sendReportNotifications = async (report: any, action: 'resolved' | 'rejected' | 'content_deleted') => {
    if (!report?.id) return
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/send-result-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || res.statusText)
      }
    } catch (error) {
      console.error('Notification error:', error)
    }
  }

  const getContentPreview = (report: ReportWithContent): string => {
    if (!report.content) return t('contentDeletedOrMissing')
    
    switch (report.reported_type) {
      case 'post':
        return report.content.content || t('noTextContent')
      case 'product':
        return report.content.name || t('noName')
      case 'comment':
      case 'product_comment':
        return report.content.content || t('noContent')
      case 'user':
        return report.reported_user?.display_name || report.reported_user?.username || t('noUsername')
      case 'order':
        return `${t('reportOrderInfo')} ${report.content.order_number || (report.reported_id ?? '').substring(0, 8)}...` || t('reportOrderInfo')
      case 'affiliate_post':
        return report.content.post?.content || t('reportAffiliatePost') || t('noContent')
      case 'tip':
        return `¥${report.content.amount || 0}` || t('reportTipRecord')
      case 'message':
        return report.content.content || t('reportChatContent')
      default:
        return t('reportUnknown')
    }
  }

  return (
    <div>
      {isAdminOrSupport && <h2 className="mb-4 text-xl font-semibold">{t('reportsTitle')}</h2>}
      {reports.length === 0 ? (
        <p className="text-muted-foreground">
          {isAdminOrSupport ? t('noPendingReports') : t('noUserReports')}
        </p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const link = getReportedContentLink(report)
            const deleteKey = `delete-${report.id}`
            const resolveKey = `resolve-${report.id}-resolved`
            const rejectKey = `resolve-${report.id}-rejected`
            const isHighlight = highlightReportId != null && report.id === highlightReportId
            return (
              <Card
                key={report.id}
                ref={isHighlight ? (el) => { highlightRef.current = el as HTMLDivElement | null } : undefined}
                className={`p-4 ${isHighlight ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              >
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        {t('reportType')}: {getReportTypeLabel(report.reported_type ?? '')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(report.created_at ?? 0).toLocaleString(locale)}
                      </span>
                    </div>
                    <p className="font-semibold">{t('reason')}: {report.reason}</p>
                    {report.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>
                    )}
                  </div>

                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">{t('reportedContent')}:</p>
                    <p className="text-sm line-clamp-2">{getContentPreview(report)}</p>
                    {report.reported_user && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {tCommon('user')}: {report.reported_user.display_name || report.reported_user.username}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {link && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(link)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {t('viewDetailReport')}
                      </Button>
                    )}
                    {isAdminOrSupport && (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteContent(report)}
                          disabled={loading[deleteKey]}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {loading[deleteKey] ? tCommon('processing') : t('deleteContent')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => report.id && handleResolve(report.id, 'resolved')}
                          disabled={loading[resolveKey]}
                        >
                          {loading[resolveKey] ? tCommon('processing') : t('reportResolved')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => report.id && handleResolve(report.id, 'rejected')}
                          disabled={loading[rejectKey]}
                        >
                          {loading[rejectKey] ? tCommon('processing') : t('reject')}
                        </Button>
                      </>
                    )}
                    {!isAdminOrSupport && (
                      <div className="text-sm text-muted-foreground">
                        {tCommon('status')}: {report.status === 'pending' ? t('statusPending') : report.status === 'resolved' ? t('statusResolved') : report.status === 'rejected' ? t('rejectedStatus') : report.status}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
