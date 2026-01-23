'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Heart, MessageCircle, MoreHorizontal, MoreVertical, Flag, UserMinus, Star, ExternalLink, Share2, Repeat2, Link2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LikeButton } from './LikeButton'
import { FavoriteButton } from './FavoriteButton'
import { TopicTag } from './TopicTag'
import { ReportDialog } from './ReportDialog'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIsFollowing, useFollow } from '@/lib/hooks/useProfile'
import { useRepost } from '@/lib/hooks/useRepost'
import { RepostDialog } from './RepostDialog'
import { ShareDialog } from './ShareDialog'
import { createClient } from '@/lib/supabase/client'
import { showSuccess, showError, showInfo, showWarning } from '@/lib/utils/toast'

function formatPostDate(createdAt: string, updatedAt?: string): string | null {
  const date = updatedAt ? new Date(updatedAt) : new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  
  // 超过3天，不显示
  if (diffDays > 3) return null
  
  // 3天内显示相对时间
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  
  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  return `${diffDays}天前`
}

interface PostCardProps {
  post: {
    id: string
    user_id: string
    content: string | null
    image_urls: string[]
    like_count: number
    comment_count: number
    share_count: number
    repost_count?: number
    favorite_count?: number
    tip_amount: number
    created_at: string
    updated_at?: string
    user?: {
      username: string
      display_name: string
      avatar_url: string | null
    }
    topics?: Array<{ id: string; name: string; slug: string }>
  }
}

export function PostCard({ post }: PostCardProps) {
  const [imageError, setImageError] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const { user } = useAuth()
  const router = useRouter()
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')
  const supabase = useMemo(() => {
    if (typeof window !== 'undefined') {
      return createClient()
    }
    return null
  }, [])
  
  // 检查是否关注了该作者
  const { data: isFollowing } = useIsFollowing(post.user_id)
  const followMutation = useFollow()
  
  // 转发相关
  const repostMutation = useRepost()
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  
  // 分享相关
  const [showShareDialog, setShowShareDialog] = useState(false)
  
  // 计算菜单位置
  useEffect(() => {
    if (isMenuOpen && menuRef.current) {
      const updatePosition = () => {
        if (menuRef.current) {
          const rect = menuRef.current.getBoundingClientRect()
          const viewportHeight = window.innerHeight
          const viewportWidth = window.innerWidth
          
          // 估算菜单高度（8个菜单项，每个约40px，加上padding约340px）
          const estimatedMenuHeight = 340
          const menuWidth = 180
          
          let top = rect.bottom + 8
          let left = rect.right - menuWidth
          
          // 检查是否会溢出底部
          if (top + estimatedMenuHeight > viewportHeight) {
            top = rect.top - estimatedMenuHeight
            // 如果上方也不够，则显示在按钮上方但限制高度
            if (top < 8) {
              top = Math.max(8, viewportHeight - estimatedMenuHeight - 8)
            }
          }
          
          // 检查左侧是否会溢出
          if (left < 8) {
            left = 8
          }
          
          setMenuPosition({ top, left })
        }
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)

      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    } else {
      setMenuPosition(null)
    }
  }, [isMenuOpen])

  // 处理举报
  const handleReport = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMenuOpen(false)
    if (!user) {
      showInfo('请先登录后再举报')
      return
    }
    setShowReportDialog(true)
  }

  // 处理取关
  const handleUnfollow = async () => {
    setIsMenuOpen(false)
    if (isFollowing) {
      followMutation.mutate({
        followingId: post.user_id,
        shouldFollow: false,
      })
      showSuccess('已取消关注')
    }
  }

  // 处理打开帖子
  const handleOpenPost = () => {
    setIsMenuOpen(false)
    router.push(`/post/${post.id}`)
  }

  // 处理分享到
  const handleShareTo = () => {
    setIsMenuOpen(false)
    setShowShareDialog(true)
  }

  // 处理转发
  const handleRepost = () => {
    setIsMenuOpen(false)
    if (!user) {
      showInfo('请先登录后再转发')
      return
    }
    setShowRepostDialog(true)
  }

  const handleRepostConfirm = (targetUserIds: string[], content?: string) => {
    repostMutation.mutate(
      {
        itemType: 'post',
        itemId: post.id,
        targetUserIds: targetUserIds,
        content: content,
      },
      {
        onSuccess: (result) => {
          setShowRepostDialog(false)
          if (result.count > 0 && result.alreadyExists > 0) {
            showSuccess(`已转发给 ${result.count} 个用户（${result.alreadyExists} 个用户已接收过）`)
          } else if (result.count > 0) {
            showSuccess(`已转发给 ${result.count} 个用户`)
          } else if (result.alreadyExists > 0) {
            showInfo(`这些用户已经接收过此转发`)
          } else {
            showError('转发失败，请重试')
          }
        },
        onError: (error: any) => {
          console.error('Repost error:', error)
          showError('转发失败，请重试')
        },
      }
    )
  }

  // 处理复制链接
  const handleCopyLink = async () => {
    setIsMenuOpen(false)
    try {
      const url = `${window.location.origin}/post/${post.id}`
      await navigator.clipboard.writeText(url)
      showSuccess('链接已复制到剪贴板')
      
      // 复制链接也算一次分享：写入 shares（由 DB trigger 更新 share_count）
      if (user && supabase) {
        try {
          const { error } = await supabase.from('shares').insert({
            user_id: user.id,
            item_type: 'post',
            item_id: post.id,
          })
          if (error) throw error
        } catch (error) {
          const msg = String((error as any)?.message ?? '')
          if (msg.includes('Rate limit exceeded')) {
            showWarning('操作过于频繁，请稍后再试')
          } else {
            console.error('Failed to create share record:', error)
          }
        }
      }
    } catch (error) {
      showError('复制链接失败')
    }
  }

  const handleCardClick = () => {
    router.push(`/post/${post.id}`)
  }

  return (
    <>
      <RepostDialog
        open={showRepostDialog}
        onClose={() => setShowRepostDialog(false)}
        onConfirm={handleRepostConfirm}
        isLoading={repostMutation.isPending}
      />
      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        url={`${typeof window !== 'undefined' ? window.location.origin : ''}/post/${post.id}`}
        title={post.content || '查看这个帖子'}
        description={post.content || undefined}
        image={post.image_urls?.[0]}
        itemType="post"
        itemId={post.id}
      />
      <Card
        className="group overflow-hidden transition-shadow hover:shadow-lg w-full min-w-0 cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Post Images */}
        {post.image_urls && post.image_urls.length > 0 && !imageError && (
          <div className="relative aspect-auto w-full">
            <img
              src={post.image_urls[0]}
              alt={post.content || 'Post image'}
              className="w-full h-auto object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          </div>
        )}

        {/* Post Content */}
        <div className="p-3 md:p-4 min-w-0">
          {/* Post Text */}
          {post.content && (
            <p className="mb-3 line-clamp-3 text-sm break-words">{post.content}</p>
          )}

          {/* Topics */}
          {post.topics && post.topics.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {post.topics.map((topic) => (
                <TopicTag key={topic.id} topic={topic} />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-center gap-1 sm:gap-2 md:gap-4">
            <div onClick={(e) => e.stopPropagation()}>
              <LikeButton postId={post.id} initialLikes={post.like_count} />
            </div>
            <Link href={`/post/${post.id}`} onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="gap-1 sm:gap-2 shrink-0">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="text-xs sm:text-sm">{post.comment_count}</span>
              </Button>
            </Link>
            <div onClick={(e) => e.stopPropagation()}>
              <FavoriteButton postId={post.id} initialFavorites={post.favorite_count ?? 0} />
            </div>
          </div>

          {/* User Info */}
          {post.user && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Link
                href={`/profile/${post.user_id}`}
                className="flex items-center gap-2 min-w-0 flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {post.user.avatar_url ? (
                    <img
                      src={post.user.avatar_url}
                      alt={post.user.display_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs">{post.user.display_name?.[0]}</span>
                  )}
                </div>
                <p className="text-sm font-semibold truncate">{post.user.display_name || post.user.username}</p>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                {formatPostDate(post.created_at, post.updated_at) && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatPostDate(post.created_at, post.updated_at)}
                  </span>
                )}
                <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="shrink-0"
                    aria-label="更多操作"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsMenuOpen(!isMenuOpen)
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>

                  {isMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[90]"
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsMenuOpen(false)
                        }}
                      />
                      {menuPosition && (
                        <Card 
                          className="fixed z-[100] min-w-[180px] p-2 shadow-lg"
                          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                          onClick={(e) => e.stopPropagation()}
                          role="menu"
                        >
                          <div className="space-y-1">
                            {/* 举报 */}
                            <button
                              onClick={handleReport}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                              role="menuitem"
                            >
                              <Flag className="mr-2 h-4 w-4" />
                              <span>{t('report')}</span>
                            </button>

                            {/* 取关（仅当已关注时显示） */}
                            {user && user.id !== post.user_id && isFollowing && (
                              <button
                                onClick={handleUnfollow}
                                className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                                role="menuitem"
                              >
                                <UserMinus className="mr-2 h-4 w-4" />
                                <span>{t('unfollow')}</span>
                              </button>
                            )}

                            {/* 打开帖子 */}
                            <button
                              onClick={handleOpenPost}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                              role="menuitem"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              <span>{t('openPost')}</span>
                            </button>

                            {/* 分享到 */}
                            <button
                              onClick={handleShareTo}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                              role="menuitem"
                            >
                              <Share2 className="mr-2 h-4 w-4" />
                              <span>{t('shareTo')}</span>
                            </button>

                            {/* 转发 */}
                            {user && (
                              <button
                                onClick={handleRepost}
                                className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                                role="menuitem"
                              >
                                <Repeat2 className="mr-2 h-4 w-4" />
                                <span>{t('repost')}</span>
                              </button>
                            )}

                            {/* 复制链接 */}
                            <button
                              onClick={handleCopyLink}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                              role="menuitem"
                            >
                              <Link2 className="mr-2 h-4 w-4" />
                              <span>{t('copyLink')}</span>
                            </button>

                            {/* 取消 */}
                            <button
                              onClick={() => setIsMenuOpen(false)}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent border-t mt-1 pt-2"
                              role="menuitem"
                            >
                              <X className="mr-2 h-4 w-4" />
                              <span>{tCommon('cancel')}</span>
                            </button>
                          </div>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

    {/* 举报对话框 */}
    <ReportDialog
      open={showReportDialog}
      onClose={() => setShowReportDialog(false)}
      reportedType="post"
      reportedId={post.id}
    />
    </>
  )
}
