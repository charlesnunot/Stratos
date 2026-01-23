'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ExternalLink, Trash2, Eye } from 'lucide-react'
import { showSuccess, showError } from '@/lib/utils/toast'

interface ReportWithContent extends any {
  content?: any
  reported_user?: any
}

interface ReportManagementProps {
  userRole?: string
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  post: '帖子',
  product: '商品',
  comment: '评论',
  user: '用户',
  order: '订单',
  affiliate_post: '带货帖子',
  tip: '打赏',
  message: '聊天内容'
}

export function ReportManagement({ userRole = 'user' }: ReportManagementProps) {
  const [reports, setReports] = useState<ReportWithContent[]>([])
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({})
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

  const handleDeleteContent = async (report: ReportWithContent) => {
    if (!user) return
    if (!supabase) {
      showError('客户端未初始化')
      return
    }
    if (!confirm(`确定要删除这个${REPORT_TYPE_LABELS[report.reported_type] || report.reported_type}吗？此操作不可撤销。`)) {
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
        case 'order':
          // 订单通常不应该被删除，只能取消
          showError('订单不能删除，只能取消')
          return
        case 'affiliate_post':
          tableName = 'affiliate_posts'
          break
        case 'tip':
          // 打赏记录不应该被删除
          showError('打赏记录不能删除')
          return
        case 'message':
          tableName = 'messages'
          break
        case 'user':
          // 用户不能被删除，只能禁用
          const { error: banError } = await supabase
            .from('profiles')
            .update({ status: 'banned' })
            .eq('id', report.reported_id)
          
          if (banError) throw banError
          
          showSuccess('用户已被禁用')
          await handleResolve(report.id, 'resolved', true)
          return
      }

      if (tableName) {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', report.reported_id)

        if (error) throw error

        showSuccess('内容已删除')
        await handleResolve(report.id, 'resolved', true)
      }
    } catch (error: any) {
      console.error('Delete error:', error)
      showError(`删除失败: ${error.message || '未知错误'}`)
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
      showError('客户端未初始化')
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

      showSuccess(action === 'resolved' ? '举报已处理' : '举报已驳回')
      loadReports()
    } catch (error: any) {
      console.error('Resolve error:', error)
      showError(`操作失败: ${error.message || '未知错误'}`)
    } finally {
      setLoading(prev => {
        const newState = { ...prev }
        delete newState[key]
        return newState
      })
    }
  }

  const sendReportNotifications = async (report: any, action: 'resolved' | 'rejected') => {
    if (!supabase) return
    
    try {
      // 通知举报人
      const { error: reporterNotificationError } = await supabase.from('notifications').insert({
        user_id: report.reporter_id,
        type: 'report',
        title: '举报处理结果',
        content: `您的举报已${action === 'resolved' ? '处理' : '驳回'}`,
        related_id: report.id,
        related_type: 'report',
        link: '/admin/reports',
      })

      if (reporterNotificationError) {
        console.error('Failed to insert notification for reporter:', reporterNotificationError)
        throw reporterNotificationError
      }

      // 如果处理通过，通知被举报用户
      if (action === 'resolved') {
        let notifiedUserId = null

        switch (report.reported_type) {
          case 'post':
            const { data: post } = await supabase
              .from('posts')
              .select('user_id')
              .eq('id', report.reported_id)
              .single()
            notifiedUserId = post?.user_id
            break
          case 'product':
            const { data: product } = await supabase
              .from('products')
              .select('seller_id')
              .eq('id', report.reported_id)
              .single()
            notifiedUserId = product?.seller_id
            break
          case 'comment':
            const { data: comment } = await supabase
              .from('comments')
              .select('user_id')
              .eq('id', report.reported_id)
              .single()
            notifiedUserId = comment?.user_id
            break
          case 'user':
            notifiedUserId = report.reported_id
            break
          case 'order':
            const { data: order } = await supabase
              .from('orders')
              .select('buyer_id, seller_id')
              .eq('id', report.reported_id)
              .single()
            // 通知买家或卖家（优先通知买家）
            notifiedUserId = order?.buyer_id || order?.seller_id
            break
          case 'affiliate_post':
            const { data: affiliatePost } = await supabase
              .from('affiliate_posts')
              .select('affiliate_id, post_id')
              .eq('id', report.reported_id)
              .single()
            if (affiliatePost?.post_id) {
              const { data: postData } = await supabase
                .from('posts')
                .select('user_id')
                .eq('id', affiliatePost.post_id)
                .single()
              // 优先通知帖子作者，其次通知推广者
              notifiedUserId = postData?.user_id || affiliatePost?.affiliate_id
            } else {
              notifiedUserId = affiliatePost?.affiliate_id
            }
            break
          case 'tip':
            const { data: tip } = await supabase
              .from('tips')
              .select('tipper_id, post_id')
              .eq('id', report.reported_id)
              .single()
            if (tip?.post_id) {
              const { data: postData } = await supabase
                .from('posts')
                .select('user_id')
                .eq('id', tip.post_id)
                .single()
              // 优先通知帖子作者，其次通知打赏者
              notifiedUserId = postData?.user_id || tip?.tipper_id
            } else {
              notifiedUserId = tip?.tipper_id
            }
            break
          case 'message':
            const { data: message } = await supabase
              .from('messages')
              .select('sender_id, conversation_id')
              .eq('id', report.reported_id)
              .single()
            if (message?.conversation_id) {
              const { data: conversation } = await supabase
                .from('conversations')
                .select('participant1_id, participant2_id')
                .eq('id', message.conversation_id)
                .single()
              // 通知对话中的另一方
              notifiedUserId = conversation?.participant1_id === message.sender_id 
                ? conversation?.participant2_id 
                : conversation?.participant1_id
            } else {
              notifiedUserId = message?.sender_id
            }
            break
        }

        if (notifiedUserId) {
          const { error: reportedUserNotificationError } = await supabase.from('notifications').insert({
            user_id: notifiedUserId,
            type: 'report',
            title: '内容被处理',
            content: `您的${REPORT_TYPE_LABELS[report.reported_type] || report.reported_type}因举报被处理`,
            related_id: report.reported_id,
            related_type: report.reported_type,
          })

          if (reportedUserNotificationError) {
            console.error('Failed to insert notification for reported user:', reportedUserNotificationError)
            throw reportedUserNotificationError
          }
        }
      }
    } catch (error) {
      console.error('Notification error:', error)
      // 通知失败不影响主流程
    }
  }

  const getContentPreview = (report: ReportWithContent): string => {
    if (!report.content) return '内容已删除或不存在'
    
    switch (report.reported_type) {
      case 'post':
        return report.content.content || '无文字内容'
      case 'product':
        return report.content.name || '无名称'
      case 'comment':
        return report.content.content || '无内容'
      case 'user':
        return report.reported_user?.display_name || report.reported_user?.username || '无用户名'
      case 'order':
        return `订单 ${report.content.order_number || report.reported_id.substring(0, 8)}...` || '订单信息'
      case 'affiliate_post':
        return report.content.post?.content || '带货帖子' || '无内容'
      case 'tip':
        return `打赏金额: ¥${report.content.amount || 0}` || '打赏记录'
      case 'message':
        return report.content.content || '聊天内容'
      default:
        return '未知类型'
    }
  }

  return (
    <div>
      {isAdminOrSupport && <h2 className="mb-4 text-xl font-semibold">举报管理</h2>}
      {reports.length === 0 ? (
        <p className="text-muted-foreground">
          {isAdminOrSupport ? '暂无待处理的举报' : '您还没有创建任何举报'}
        </p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const link = getReportedContentLink(report)
            const deleteKey = `delete-${report.id}`
            const resolveKey = `resolve-${report.id}-resolved`
            const rejectKey = `resolve-${report.id}-rejected`
            
            return (
              <Card key={report.id} className="p-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        举报类型: {report.reported_type === 'post' ? '帖子' : report.reported_type === 'product' ? '商品' : report.reported_type === 'comment' ? '评论' : report.reported_type === 'user' ? '用户' : report.reported_type === 'order' ? '订单' : report.reported_type === 'affiliate_post' ? '带货帖子' : report.reported_type === 'tip' ? '打赏' : report.reported_type === 'message' ? '聊天内容' : report.reported_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(report.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <p className="font-semibold">原因: {report.reason}</p>
                    {report.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>
                    )}
                  </div>

                  {/* 被举报内容预览 */}
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">被举报内容:</p>
                    <p className="text-sm line-clamp-2">{getContentPreview(report)}</p>
                    {report.reported_user && (
                      <p className="text-xs text-muted-foreground mt-1">
                        用户: {report.reported_user.display_name || report.reported_user.username}
                      </p>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex flex-wrap gap-2">
                    {link && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(link)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        查看详情
                      </Button>
                    )}
                    {/* 只有管理员/客服才能执行管理操作 */}
                    {isAdminOrSupport && (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteContent(report)}
                          disabled={loading[deleteKey]}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {loading[deleteKey] ? '处理中...' : '删除内容'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleResolve(report.id, 'resolved')}
                          disabled={loading[resolveKey]}
                        >
                          {loading[resolveKey] ? '处理中...' : '已处理'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(report.id, 'rejected')}
                          disabled={loading[rejectKey]}
                        >
                          {loading[rejectKey] ? '处理中...' : '驳回'}
                        </Button>
                      </>
                    )}
                    {/* 普通用户显示举报状态 */}
                    {!isAdminOrSupport && (
                      <div className="text-sm text-muted-foreground">
                        状态: {report.status === 'pending' ? '待处理' : report.status === 'resolved' ? '已处理' : report.status === 'rejected' ? '已驳回' : report.status}
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
