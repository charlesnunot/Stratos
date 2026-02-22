'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useVideoStream } from '@/lib/hooks/usePosts'
import type { Post } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { LikeButton } from '@/components/social/LikeButton'
import { FavoriteButton } from '@/components/social/FavoriteButton'
import { FollowButton } from '@/components/social/FollowButton'
import { ShareDialog } from '@/components/social/ShareDialog'
import { ReportDialog } from '@/components/social/ReportDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Link } from '@/i18n/navigation'
import { ChevronUp, ChevronDown, ArrowLeft, MessageCircle, Share2, MoreVertical, Flag, FileText } from 'lucide-react'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTranslations, useLocale } from 'next-intl'
import { showInfo } from '@/lib/utils/toast'
import { getDisplayContent } from '@/lib/ai/display-translated'

/** 超过该字符数视为「大量内容」，展示展开/收起 */
const LONG_CONTENT_THRESHOLD = 80

export default function PostVideoStreamPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const postId = params.id as string
  const { data, isLoading, error, fetchOlder, fetchNewer } = useVideoStream(postId)
  const [list, setList] = useState<Post[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingNewer, setLoadingNewer] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [contentExpanded, setContentExpanded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')
  const locale = useLocale()

  useEffect(() => {
    if (data?.posts?.length) {
      setList(data.posts)
      setCurrentIndex(Math.min(data.currentIndex, data.posts.length - 1))
    }
  }, [data?.posts, data?.currentIndex])

  // 在 list 未同步前用 data.posts 作为当前帖来源，避免 post 为 undefined
  const currentPostFromList = list.length > 0 ? list[currentIndex] : null
  const currentPostFromData =
    data?.posts?.length && data.currentIndex != null
      ? data.posts[Math.min(data.currentIndex, data.posts.length - 1)]
      : null
  const post = currentPostFromList ?? currentPostFromData ?? null
  const videoInfo = post?.post_type === 'short_video' ? (post as Post).video_info : null

  // 按当前 locale 显示原文或译文，与详情页一致（必须在 post 声明之后）
  const displayContent =
    post != null
      ? getDisplayContent(locale, post.content_lang ?? null, post.content, post.content_translated)
      : ''

  const handlePrev = useCallback(() => {
    if (currentIndex <= 0) {
      if (list.length > 0 && list[0]?.created_at) {
        setLoadingNewer(true)
        fetchNewer(list[0].created_at, 20)
          .then((newPosts) => {
            if (newPosts.length > 0) {
              setList((prev) => [...newPosts, ...prev])
              setCurrentIndex(newPosts.length)
            }
          })
          .finally(() => setLoadingNewer(false))
      }
      return
    }
    setCurrentIndex((i) => i - 1)
  }, [currentIndex, list, fetchNewer])

  const handleNext = useCallback(() => {
    if (currentIndex >= list.length - 1) {
      if (list.length > 0 && list[list.length - 1]?.created_at) {
        setLoadingOlder(true)
        fetchOlder(list[list.length - 1].created_at, 20)
          .then((newPosts) => {
            if (newPosts.length > 0) {
              setList((prev) => [...prev, ...newPosts])
            }
          })
          .finally(() => setLoadingOlder(false))
      }
      return
    }
    setCurrentIndex((i) => i + 1)
  }, [currentIndex, list, fetchOlder])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.play().catch(() => {})
    return () => {
      el.pause()
    }
  }, [currentIndex, post?.id])

  // 切换视频时收起已展开的文案
  useEffect(() => {
    setContentExpanded(false)
  }, [post?.id])

  const isLongContent = displayContent.length > LONG_CONTENT_THRESHOLD

  if (isLoading || (!data && !error)) {
    return <LoadingState />
  }

  if (error || !data?.posts?.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <EmptyState
          title={t('postNotFoundOrLoadFailed')}
          description={error instanceof Error ? error.message : tCommon('error')}
        />
        <Button variant="outline" className="absolute left-4 top-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon('back')}
        </Button>
      </div>
    )
  }

  if (!post) {
    return <LoadingState />
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* 当前条视频：全屏竖版 */}
      <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center">
        {videoInfo?.video_url ? (
          <video
            ref={videoRef}
            src={videoInfo.video_url}
            poster={videoInfo.cover_url || post.image_urls?.[0] || undefined}
            className="w-full h-full max-h-[100vh] object-contain"
            playsInline
            muted
            loop
            preload="auto"
            onClick={(e) => {
              e.preventDefault()
              const rect = (e.target as HTMLVideoElement).getBoundingClientRect()
              const y = e.clientY - rect.top
              if (y < rect.height / 2) handlePrev()
              else handleNext()
            }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-white/60">
            {tCommon('noImage')}
          </div>
        )}

        {/* 顶部：返回 + 更多 */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => router.back()}
            aria-label={tCommon('back')}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                aria-label={tCommon('more')}
              >
                <MoreVertical className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/post/${post.id}`} className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  {t('viewFullPost')}
                </Link>
              </DropdownMenuItem>
              {user && user.id !== post.user_id && (
                <DropdownMenuItem
                  onClick={() => {
                    setShowReportDialog(true)
                  }}
                  className="flex items-center gap-2"
                >
                  <Flag className="h-4 w-4" />
                  {t('report')}
                </DropdownMenuItem>
              )}
              {!user && (
                <DropdownMenuItem
                  onClick={() => showInfo(t('pleaseLoginToReport'))}
                  className="flex items-center gap-2"
                >
                  <Flag className="h-4 w-4" />
                  {t('report')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 右侧：作者（可选）、关注、点赞、评论、收藏、分享 */}
        <div className="absolute right-4 bottom-24 flex flex-col items-center gap-4">
          {post.user && (
            <>
              <Link
                href={`/profile/${post.user_id}`}
                className="flex flex-col items-center gap-1 text-white"
              >
                <div className="h-12 w-12 rounded-full border-2 border-white overflow-hidden bg-muted">
                  {post.user.avatar_url ? (
                    <img src={post.user.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg">
                      {post.user.display_name?.[0] || '?'}
                    </span>
                  )}
                </div>
                <span className="text-xs truncate max-w-[80px]">{post.user.display_name || post.user.username}</span>
              </Link>
              {user && user.id !== post.user_id && (
                <div className="flex justify-center">
                  <FollowButton userId={post.user_id} />
                </div>
              )}
            </>
          )}
          <div className="flex flex-col gap-3">
            <LikeButton postId={post.id} initialLikes={post.like_count ?? 0} enabled />
            <Link href={`/post/${post.id}`} className="flex flex-col items-center gap-0 text-white">
              <MessageCircle className="h-8 w-8" />
              <span className="text-xs">{post.comment_count ?? 0}</span>
            </Link>
            <FavoriteButton postId={post.id} initialFavorites={post.favorite_count ?? 0} enabled />
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-transparent hover:bg-white/20"
              onClick={() => setShowShareDialog(true)}
              aria-label={t('share')}
            >
              <Share2 className="h-8 w-8" />
            </Button>
          </div>
        </div>

        {/* 底部：文案摘要（按 locale）；短内容直接点去详情，长内容可展开/收起 */}
        <div className="absolute left-4 right-16 bottom-4 min-h-[2.5rem] flex flex-col justify-end gap-1">
          {!displayContent ? (
            <Link
              href={`/post/${post.id}`}
              className="text-white/80 text-xs hover:underline inline-flex items-center gap-1"
            >
              {t('viewFullPost')}
            </Link>
          ) : isLongContent && contentExpanded ? (
            <>
              <div className="text-white text-sm drop-shadow max-h-32 overflow-y-auto whitespace-pre-wrap break-words pr-1">
                {displayContent}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setContentExpanded(false)}
                  className="text-white/90 text-xs hover:underline focus:outline-none"
                >
                  {t('collapseContent')}
                </button>
                <Link
                  href={`/post/${post.id}`}
                  className="text-white/90 text-xs hover:underline"
                >
                  {t('viewFullPost')}
                </Link>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                isLongContent ? setContentExpanded(true) : router.push(`/post/${post.id}`)
              }
              className="text-left text-white text-sm line-clamp-2 drop-shadow hover:underline focus:outline-none focus:underline"
            >
              {displayContent}
              {isLongContent && !contentExpanded && (
                <span className="text-white/80 ml-1">··· {t('expandContent')}</span>
              )}
            </button>
          )}
        </div>

        {/* 上一条 / 下一条 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-4 top-[30%] -translate-y-1/2 text-white/80 hover:bg-white/20 rounded-full h-12 w-12"
          onClick={handlePrev}
          disabled={loadingNewer && currentIndex === 0}
          aria-label={t('videoStreamPrev')}
        >
          <ChevronUp className="h-8 w-8" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-4 top-[70%] -translate-y-1/2 text-white/80 hover:bg-white/20 rounded-full h-12 w-12"
          onClick={handleNext}
          disabled={loadingOlder && currentIndex === list.length - 1}
          aria-label={t('videoStreamNext')}
        >
          <ChevronDown className="h-8 w-8" />
        </Button>
      </div>

      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        url={typeof window !== 'undefined' ? `${window.location.origin}/post/${post.id}` : `/post/${post.id}`}
        title={displayContent ? displayContent.slice(0, 80) : t('viewFullPost')}
        description={displayContent || undefined}
        image={videoInfo?.cover_url || post.image_urls?.[0]}
        itemType="post"
        itemId={post.id}
      />

      <ReportDialog
        open={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        reportedType="post"
        reportedId={post.id}
      />
    </div>
  )
}
