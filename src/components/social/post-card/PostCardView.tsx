'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import {
  MoreVertical,
  Flag,
  UserMinus,
  ExternalLink,
  Share2,
  Repeat2,
  Link2,
  X,
  Pencil,
  Trash2,
  BarChart3,
  MessageCircle,
} from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency/format-currency'
import { LikeButton } from '@/components/social/LikeButton'
import { FavoriteButton } from '@/components/social/FavoriteButton'
import { TopicTag } from '@/components/social/TopicTag'
import { ReportDialog } from '@/components/social/ReportDialog'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { PostStatsDialog } from '@/components/social/PostStatsDialog'

import type { ListPostDTO, PostCardCapabilities, PostCardState } from '@/lib/post-card/types'
import type { PostActions } from '@/lib/post-card/usePostActions'

function formatPostDate(
  createdAt: string,
  updatedAt: string | undefined,
  t: (key: string, values?: Record<string, number>) => string
): string | null {
  const date = updatedAt ? new Date(updatedAt) : new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays > 3) return null

  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return t('timeJustNow')
  if (diffMins < 60) return t('timeMinutesAgo', { count: diffMins })
  if (diffHours < 24) return t('timeHoursAgo', { count: diffHours })
  return t('timeDaysAgo', { count: diffDays })
}

export interface PostCardViewProps {
  dto: ListPostDTO
  state: PostCardState
  capabilities: PostCardCapabilities
  actions: PostActions
}

export function PostCardView({ dto, capabilities, actions }: PostCardViewProps) {
  const [imageError, setImageError] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showStatsDialog, setShowStatsDialog] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [hiddenByUser, setHiddenByUser] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

  const router = useRouter()
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  // 计算菜单位置（纯 UI）
  useEffect(() => {
    if (!isMenuOpen || !menuRef.current) {
      setMenuPosition(null)
      return
    }

    const updatePosition = () => {
      if (!menuRef.current) return
      const rect = menuRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      const estimatedMenuHeight = 340
      const menuWidth = 180

      let top = rect.bottom + 8
      let left = rect.right - menuWidth

      if (top + estimatedMenuHeight > viewportHeight) {
        top = rect.top - estimatedMenuHeight
        if (top < 8) {
          top = Math.max(8, viewportHeight - estimatedMenuHeight - 8)
        }
      }

      if (left < 8) left = 8
      setMenuPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isMenuOpen])

  const handleOpenPost = useCallback(() => {
    setIsMenuOpen(false)
    if (dto.content.postType === 'short_video') {
      router.push(`/post/${dto.id}/video`)
    } else {
      router.push(`/post/${dto.id}`)
    }
  }, [dto.id, dto.content.postType, router])

  const handleEditPost = useCallback(() => {
    setIsMenuOpen(false)
    if (!capabilities.canEdit) return
    router.push(`/post/${dto.id}/edit`)
  }, [capabilities.canEdit, dto.id, router])

  const handleReportClick = useCallback(() => {
    setIsMenuOpen(false)
    if (actions.requestReportDialog()) {
      setShowReportDialog(true)
    }
  }, [actions])

  const handleUnfollowClick = useCallback(() => {
    setIsMenuOpen(false)
    actions.unfollowAuthor()
  }, [actions])

  const handleCopyLinkClick = useCallback(async () => {
    setIsMenuOpen(false)
    await actions.copyLink()
  }, [actions])

  const handleDeleteClick = useCallback(async () => {
    setIsMenuOpen(false)
    await actions.deletePost()
  }, [actions])

  const handleViewStatsClick = useCallback(() => {
    setIsMenuOpen(false)
    if (!capabilities.canViewStats) return
    setShowStatsDialog(true)
  }, [capabilities.canViewStats])

  const handleFeedFeedback = useCallback(
    async (agreed: boolean | null, dismissed: boolean) => {
      if (!dto.recommendationReason) return
      setFeedbackSent(true)
      if (dismissed) setHiddenByUser(true)
      try {
        await fetch('/api/feed/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postId: dto.id,
            reasonType: dto.recommendationReason.reasonType,
            agreed: agreed ?? null,
            dismissed,
          }),
        })
      } catch {
        setFeedbackSent(false)
        if (dismissed) setHiddenByUser(false)
      }
    },
    [dto.id, dto.recommendationReason]
  )

  const reasonLabel =
    dto.recommendationReason?.reasonType === 'followed_user'
      ? t('reasonFollowedUser')
      : dto.recommendationReason?.reasonType === 'followed_topic'
        ? t('reasonFollowedTopic')
        : dto.recommendationReason?.reasonType === 'trending'
          ? t('reasonTrending')
          : dto.recommendationReason?.reasonType === 'story_topic'
            ? t('reasonStoryTopic')
            : dto.recommendationReason?.reasonType === 'music_artist'
              ? t('reasonMusicArtist')
              : dto.recommendationReason?.reasonType === 'short_video_trending'
                ? t('reasonShortVideoTrending')
                : null

  if (hiddenByUser) return null

  return (
    <>
      <RepostDialog
        open={showRepostDialog}
        onClose={() => setShowRepostDialog(false)}
        onConfirm={async (targetUserIds, content) => {
          const res = await actions.repostToUsers(targetUserIds, content)
          if (res === 'ok') setShowRepostDialog(false)
        }}
        isLoading={actions.repostPending}
      />

      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        url={`${typeof window !== 'undefined' ? window.location.origin : ''}/post/${dto.id}`}
        title={dto.content.text || '查看这个帖子'}
        description={dto.content.text || undefined}
        image={dto.content.imageUrls?.[0]}
        itemType="post"
        itemId={dto.id}
      />

      <Card className="group overflow-hidden transition-shadow hover:shadow-lg w-full min-w-0 cursor-pointer" onClick={handleOpenPost}>
        {/* 按内容类型渲染顶部媒体/正文 */}
        {dto.content.postType === 'short_video' && dto.content.videoInfo?.video_url ? (
          <div className="relative w-full max-h-[360px] flex justify-center bg-black/5" style={{ aspectRatio: '9/16' }}>
            <video
              src={dto.content.videoInfo.video_url}
              poster={dto.content.videoInfo.cover_url || undefined}
              controls
              className="w-full h-full object-contain"
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : dto.content.postType === 'music' && dto.content.musicInfo?.music_url ? (
          <div className="relative w-full">
            {(dto.content.musicInfo.cover_url || dto.content.imageUrls?.[0] || dto.content.musicInfo.music_url) && (
              <div className="relative aspect-video w-full bg-muted flex items-center justify-center">
                {(dto.content.musicInfo.cover_url || dto.content.imageUrls?.[0]) && !imageError ? (
                  <img
                    src={dto.content.musicInfo.cover_url || dto.content.imageUrls![0]}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <span className="text-muted-foreground text-sm">♪</span>
                )}
                <audio
                  src={dto.content.musicInfo.music_url}
                  controls
                  className="w-full mt-2 px-2 pb-2"
                  preload="metadata"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        ) : (dto.content.postType === 'story' || dto.content.postType === 'series') ? (
          <div className="p-3 md:p-4 min-w-0 border-b border-border/50">
            {dto.content.text && (
              <p className="line-clamp-3 text-sm break-words mb-1">{dto.content.text}</p>
            )}
            {dto.content.storyInfo && (dto.content.storyInfo.content_length != null || dto.content.storyInfo.chapter_number != null) && (
              <p className="text-xs text-muted-foreground">
                {dto.content.storyInfo.chapter_number != null && `Ch.${dto.content.storyInfo.chapter_number} `}
                {dto.content.storyInfo.content_length != null && ` · ${dto.content.storyInfo.content_length}字`}
              </p>
            )}
            <Link href={`/post/${dto.id}`} className="text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              {t('readMore')}
            </Link>
          </div>
        ) : (
          <>
            {dto.content.imageUrls && dto.content.imageUrls.length > 0 && !imageError && (
              <div className="relative aspect-auto w-full">
                <img
                  src={dto.content.imageUrls[0]}
                  alt={dto.content.text || 'Post image'}
                  className="w-full h-auto object-cover"
                  onError={() => setImageError(true)}
                  loading="lazy"
                />
              </div>
            )}
          </>
        )}

        <div className="p-3 md:p-4 min-w-0">
          {dto.content.postType !== 'story' && dto.content.postType !== 'series' && dto.content.text && <p className="mb-3 line-clamp-3 text-sm break-words">{dto.content.text}</p>}

          {dto.content.topics && dto.content.topics.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <TopicTag key={dto.content.topics[0].id} topic={dto.content.topics[0]} />
            </div>
          )}

          {dto.content.linkedProducts && dto.content.linkedProducts.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              {dto.content.linkedProducts
                .filter((lp) => lp.product)
                .slice(0, 3)
                .map((lp) => (
                  <Link key={lp.product_id} href={`/product/${lp.product!.id}`} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2 text-left transition-colors hover:bg-muted/50 min-w-0 max-w-full">
                    {lp.product!.images?.[0] ? (
                      <img src={lp.product!.images[0]} alt={lp.product!.name} className="h-12 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">—</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{lp.product!.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(lp.product!.price, 'CNY')}</p>
                    </div>
                  </Link>
                ))}
            </div>
          )}

          <div className="flex items-center justify-center gap-1 sm:gap-2 md:gap-4">
            <div onClick={(e) => e.stopPropagation()}>
              <LikeButton postId={dto.id} initialLikes={dto.stats.likeCount} enabled={capabilities.canLike} />
            </div>
            <Link href={`/post/${dto.id}`} onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="gap-1 sm:gap-2 shrink-0">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="text-xs sm:text-sm">{dto.stats.commentCount}</span>
              </Button>
            </Link>
            <div onClick={(e) => e.stopPropagation()}>
              <FavoriteButton postId={dto.id} initialFavorites={dto.stats.favoriteCount} enabled={capabilities.canFavorite} />
            </div>
          </div>

          {reasonLabel && !feedbackSent && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
              <span>{reasonLabel}</span>
              <span className="shrink-0">
                <button type="button" className="hover:underline" onClick={() => handleFeedFeedback(true, false)}>
                  {t('feedbackHelpful')}
                </button>
                <span className="mx-1">·</span>
                <button type="button" className="hover:underline" onClick={() => handleFeedFeedback(false, false)}>
                  {t('feedbackNotRelevant')}
                </button>
                <span className="mx-1">·</span>
                <button type="button" className="hover:underline" onClick={() => handleFeedFeedback(null, true)}>
                  {t('feedbackHide')}
                </button>
              </span>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <Link
              href={`/profile/${dto.author.id}`}
              className="flex items-center gap-2 min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {dto.author.avatarUrl ? (
                  <img src={dto.author.avatarUrl} alt={dto.author.displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs">{dto.author.displayName?.[0]}</span>
                )}
              </div>
              <p className="text-sm font-semibold truncate">{dto.author.displayName || dto.author.username}</p>
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              {formatPostDate(dto.createdAt, dto.updatedAt, (k, v) => tCommon(k, v as Record<string, number>)) && (
                <span className="text-xs text-muted-foreground shrink-0">{formatPostDate(dto.createdAt, dto.updatedAt, (k, v) => tCommon(k, v as Record<string, number>))}</span>
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
                          {(capabilities.canEdit || capabilities.canDelete || capabilities.canViewStats) && (
                            <>
                              {capabilities.canEdit && (
                                <button
                                  onClick={handleEditPost}
                                  className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                                  role="menuitem"
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  <span>{t('editPost')}</span>
                                </button>
                              )}
                              {capabilities.canViewStats && (
                                <button
                                  onClick={handleViewStatsClick}
                                  className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                                  role="menuitem"
                                >
                                  <BarChart3 className="mr-2 h-4 w-4" />
                                  <span>{t('postStats')}</span>
                                </button>
                              )}
                              {capabilities.canDelete && (
                                <button
                                  onClick={handleDeleteClick}
                                  disabled={actions.isDeleting}
                                  className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent text-destructive hover:text-destructive"
                                  role="menuitem"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  <span>{actions.isDeleting ? tCommon('processing') : t('deletePost')}</span>
                                </button>
                              )}
                              <div className="border-t my-1" />
                            </>
                          )}

                          {capabilities.canReport && (
                            <button
                              onClick={handleReportClick}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                              role="menuitem"
                            >
                              <Flag className="mr-2 h-4 w-4" />
                              <span>{t('report')}</span>
                            </button>
                          )}

                          {capabilities.canFollowAuthor && dto.viewerInteraction?.isFollowingAuthor && (
                            <button
                              onClick={handleUnfollowClick}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                              role="menuitem"
                            >
                              <UserMinus className="mr-2 h-4 w-4" />
                              <span>{t('unfollow')}</span>
                            </button>
                          )}

                          <button
                            onClick={handleOpenPost}
                            className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                            role="menuitem"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            <span>{t('openPost')}</span>
                          </button>

                          <button
                            onClick={() => {
                              setIsMenuOpen(false)
                              setShowShareDialog(true)
                            }}
                            className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                            role="menuitem"
                          >
                            <Share2 className="mr-2 h-4 w-4" />
                            <span>{t('shareTo')}</span>
                          </button>

                          {capabilities.canRepost && (
                            <button
                              onClick={() => {
                                setIsMenuOpen(false)
                                setShowRepostDialog(true)
                              }}
                              className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                              role="menuitem"
                            >
                              <Repeat2 className="mr-2 h-4 w-4" />
                              <span>{t('repost')}</span>
                            </button>
                          )}

                          <button
                            onClick={handleCopyLinkClick}
                            className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                            role="menuitem"
                          >
                            <Link2 className="mr-2 h-4 w-4" />
                            <span>{t('copyLink')}</span>
                          </button>

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
        </div>
      </Card>

      <ReportDialog open={showReportDialog} onClose={() => setShowReportDialog(false)} reportedType="post" reportedId={dto.id} />

      <PostStatsDialog
        open={showStatsDialog}
        onClose={() => setShowStatsDialog(false)}
        post={{
          like_count: dto.stats.likeCount,
          comment_count: dto.stats.commentCount,
          share_count: dto.stats.shareCount,
          repost_count: dto.stats.repostCount,
          favorite_count: dto.stats.favoriteCount,
          tip_amount: dto.stats.tipAmount,
        }}
      />
    </>
  )
}

