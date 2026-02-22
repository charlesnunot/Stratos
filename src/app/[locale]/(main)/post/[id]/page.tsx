'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from '@/i18n/navigation'
import { CommentSection } from '@/components/social/CommentSection'
import { TipButton } from '@/components/social/TipButton'
import { LikeButton } from '@/components/social/LikeButton'
import { FavoriteButton } from '@/components/social/FavoriteButton'
import { FollowButton } from '@/components/social/FollowButton'
import { TopicTag } from '@/components/social/TopicTag'
import { ReportDialog } from '@/components/social/ReportDialog'
import { ChatButton } from '@/components/social/ChatButton'
import { ProductCard } from '@/components/ecommerce/ProductCard'
import { Button } from '@/components/ui/button'
import { Loader2, MessageCircle, Share2, ChevronLeft, ChevronRight, Flag, Repeat2, ShoppingBag, Play, Pause } from 'lucide-react'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useParams } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { useRepost } from '@/lib/hooks/useRepost'
import { useTrackView } from '@/lib/hooks/useTrackView'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { showSuccess, showInfo, showError, showWarning } from '@/lib/utils/toast'
import { useTranslations, useLocale } from 'next-intl'
import { usePostPage } from '@/lib/hooks/usePostPage'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { createImageErrorHandler } from '@/lib/utils/image-retry'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
export default function PostPage() {
  const params = useParams()
  const postId = params.id as string
  const router = useRouter()
  const state = usePostPage(postId)
  const t = useTranslations('posts')
  const tMessages = useTranslations('messages')
  const tCommon = useTranslations('common')
  const tAffiliate = useTranslations('affiliate')
  const locale = useLocale()
  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [musicBgIndex, setMusicBgIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoPaused, setVideoPaused] = useState(true)
  const [imageRetryCount, setImageRetryCount] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleImageError = createImageErrorHandler({
    maxRetries: 3,
    retryDelay: 1000,
    fallbackSrc: '/placeholder-product.png',
  })

  // 音乐帖多图背景轮播
  useEffect(() => {
    if (state.status !== 'ready') return
    const post = state.post
    if (!post) return
    const imgs = post.image_urls ?? []
    if (post.post_type !== 'music' || imgs.length <= 1) return
    const n = imgs.length
    const id = setInterval(() => {
      setMusicBgIndex((prev) => (prev + 1) % n)
    }, 5000)
    return () => clearInterval(id)
  }, [state.status, state.status === 'ready' ? state.post?.id : undefined])

  // 短视频：进入详情页自动播放，播完显示播放按钮可重播
  useEffect(() => {
    if (state.status !== 'ready') return
    const post = state.post
    if (!post) return
    if (post.post_type !== 'short_video') return
    const el = videoRef.current
    if (!el) return
    setVideoPaused(true)
    el.play().catch(() => {})
  }, [state.status, state.status === 'ready' ? state.post?.id : undefined])

  // 转发相关
  const repostMutation = useRepost()

  // PV/UV 统计（含匿名）：仅在 ready 且帖子已审核时上报
  const canTrackView = state.status === 'ready' && state.post?.status === 'approved'
  useTrackView(
    canTrackView ? 'post' : null,
    canTrackView ? postId : null
  )

  if (state.status === 'loading') {
    return <LoadingState />
  }

  if (state.status === 'unavailable') {
    let errorTitle = t('postNotFoundOrLoadFailed')
    let errorDescription = ''

    if (state.reason === 'deleted') {
      errorTitle = t('postNotFound')
      errorDescription = t('postNotFoundDescription')
    } else if (state.reason === 'permission') {
      errorTitle = t('noPermissionToView')
      errorDescription = t('noPermissionToViewDescription')
    } else if (state.reason === 'network') {
      errorTitle = t('networkError')
      errorDescription = t('networkErrorDescription')
    }

    return (
      <div className="mx-auto w-full max-w-7xl px-2 sm:px-4 py-4 md:py-6">
        <EmptyState 
          title={errorTitle}
          description={errorDescription}
        />
      </div>
    )
  }

  if (state.status !== 'ready') {
    return null
  }

  const { post, user, capabilities, tipDisabledReason, authorizationToken } = state

  const images = post.image_urls || []
  const hasMultipleImages = images.length > 1
  const postType = (post as { post_type?: string }).post_type ?? 'normal'
  const videoInfo = (post as { video_info?: { video_url: string; duration_seconds?: number; cover_url?: string | null } }).video_info
  const musicInfo = (post as { music_info?: { music_url: string; duration_seconds?: number; cover_url?: string | null } }).music_info
  const storyInfo = (post as { story_info?: { chapter_number?: number; content_length?: number } }).story_info

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }

  const handleShare = () => {
    setShowShareDialog(true)
  }

  const handleRepost = () => {
    if (!user) {
      showInfo(t('pleaseLoginToRepost'))
      return
    }
    setShowRepostDialog(true)
  }

  const handleRepostConfirm = (targetUserIds: string[], content?: string) => {
    repostMutation.mutate(
      {
        itemType: 'post',
        itemId: postId,
        targetUserIds: targetUserIds,
        content: content,
      },
      {
        onSuccess: (result) => {
          setShowRepostDialog(false)
          if (result.count > 0 && result.alreadyExists > 0) {
            showSuccess(t('repostSuccessWithExists', { count: result.count, alreadyExists: result.alreadyExists }))
          } else if (result.count > 0) {
            showSuccess(t('repostSuccess', { count: result.count }))
          } else if (result.alreadyExists > 0) {
            showInfo(t('repostAlreadyExists'))
          } else {
            showError(t('repostFailed'))
          }
        },
        onError: (error: any) => {
          console.error('Repost error:', error)
          showError(t('repostFailed'))
        },
      }
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-2 sm:px-4 py-4 md:py-6">
      <div className="grid gap-4 md:gap-6 lg:grid-cols-[40%_60%] min-w-0">
        {/* Left Column: Media by post_type */}
        <div className="min-w-0">
          {postType === 'short_video' && videoInfo?.video_url ? (
            <div className="relative w-full max-w-full overflow-hidden rounded-lg bg-muted space-y-2">
              <div className="relative w-full bg-muted" style={{ aspectRatio: '9/16', maxHeight: 'min(80vh, 600px)' }}>
                <video
                  key={`${videoInfo.video_url}-${imageRetryCount}`}
                  ref={videoRef}
                  src={videoInfo.video_url}
                  poster={videoInfo.cover_url || images[0] || undefined}
                  className="h-full w-full object-contain"
                  preload="auto"
                  playsInline
                  onPlay={() => setVideoPaused(false)}
                  onPause={() => setVideoPaused(true)}
                  onEnded={() => setVideoPaused(true)}
                  onError={() => {
                    console.error('Video load error:', videoInfo.video_url)
                    setImageRetryCount(prev => prev + 1)
                  }}
                />
                {videoPaused && (
                  <button
                    type="button"
                    onClick={() => videoRef.current?.play()}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors rounded-lg"
                    aria-label={t('play')}
                  >
                    <div className="rounded-full bg-black/50 p-5">
                      <Play className="h-14 w-14 text-white fill-white" />
                    </div>
                  </button>
                )}
              </div>
              <Link
                href={`/post/${postId}/video`}
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                {t('enterVideoStream')}
              </Link>
            </div>
          ) : postType === 'music' && musicInfo?.music_url ? (
            <div className="relative w-full max-w-full overflow-hidden rounded-lg bg-muted aspect-video min-h-[280px] md:min-h-[300px]">
              {/* 底层：无图占位 / 有图则用 image_urls 作背景（多图轮播由 musicBgIndex 控制） */}
              {images.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-muted-foreground text-5xl">♪</span>
                </div>
              ) : (
                <img
                  key={`${images[musicBgIndex] ?? musicInfo.cover_url ?? images[0]}-${imageRetryCount}`}
                  src={images[musicBgIndex] ?? musicInfo.cover_url ?? images[0]}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={handleImageError}
                />
              )}
              {/* 变暗层 */}
              <div className="absolute inset-0 bg-black/50" aria-hidden />
              {/* 上层：居中大播放钮 + 底部 audio 控制条 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-16 w-16 rounded-full bg-white/90 text-black hover:bg-white shrink-0"
                  onClick={() => {
                    const el = audioRef.current
                    if (!el) return
                    if (el.paused) {
                      el.play().catch(() => {})
                      setIsPlaying(true)
                    } else {
                      el.pause()
                      setIsPlaying(false)
                    }
                  }}
                  aria-label={isPlaying ? t('pause') : t('play')}
                >
                  {isPlaying ? (
                    <Pause className="h-8 w-8 fill-current" />
                  ) : (
                    <Play className="h-8 w-8 fill-current ml-0.5" />
                  )}
                </Button>
                <audio
                  key={`${musicInfo.music_url}-${imageRetryCount}`}
                  ref={audioRef}
                  src={musicInfo.music_url}
                  controls
                  className="w-full max-w-md opacity-90 rounded"
                  preload="metadata"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onError={() => {
                    console.error('Audio load error:', musicInfo.music_url)
                    setImageRetryCount(prev => prev + 1)
                  }}
                />
              </div>
            </div>
          ) : (postType === 'story' || postType === 'series') && !images.length ? (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted md:min-h-[300px]">
              <span className="text-muted-foreground text-sm">{tCommon('noImage')}</span>
            </div>
          ) : images.length > 0 ? (
            <div className="relative w-full max-w-full overflow-hidden rounded-lg bg-muted">
              <div className="relative aspect-[4/3] w-full md:min-h-[600px]">
                <img
                  key={`${images[currentImageIndex]}-${imageRetryCount}`}
                  src={images[currentImageIndex]}
                  alt={post.content || 'Post image'}
                  className="h-full w-full max-w-full object-contain"
                  loading="eager"
                  onError={handleImageError}
                />
                {hasMultipleImages && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70"
                      onClick={handlePreviousImage}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70"
                      onClick={handleNextImage}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                      {images.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentImageIndex(index)}
                          className={`h-2 rounded-full transition-all ${
                            index === currentImageIndex ? 'w-8 bg-white' : 'w-2 bg-white/50 hover:bg-white/70'
                          }`}
                          aria-label={t('viewImage', { index: index + 1 })}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted md:min-h-[600px]">
              <span className="text-muted-foreground">{tCommon('noImage')}</span>
            </div>
          )}
        </div>

        {/* Right Column: Content Panel */}
        <div className="lg:sticky lg:top-4 lg:h-fit min-w-0 overflow-visible">
          <div className="space-y-4 md:space-y-6 min-w-0">
            {/* Creator Info */}
            {post.user && (
              <div className="flex items-start gap-3 min-w-0 overflow-x-visible overflow-y-clip">
                <Link href={`/profile/${post.user_id}`} className="shrink-0 flex-shrink-0">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {post.user.avatar_url ? (
                      <img
                        key={`${post.user.avatar_url}-${imageRetryCount}`}
                        src={post.user.avatar_url}
                        alt={post.user.display_name}
                        className="h-full w-full object-cover"
                        onError={handleImageError}
                      />
                    ) : (
                      <span className="text-lg">
                        {post.user.display_name?.[0] || '?'}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="min-w-0 flex-1 overflow-x-visible overflow-y-clip">
                  <Link href={`/profile/${post.user_id}`} className="block min-w-0">
                    <p className="font-semibold hover:underline break-words overflow-wrap-anywhere">
                      {post.user.display_name}
                    </p>
                    <p className="text-sm text-muted-foreground break-words overflow-wrap-anywhere">
                      @{post.user.username}
                    </p>
                  </Link>
                </div>
                {user && user.id !== post.user_id && (
                  <div className="shrink-0 flex gap-2 flex-wrap relative z-10" style={{ pointerEvents: 'auto' }}>
                    {capabilities.canFollowAuthor && (
                      <FollowButton userId={post.user_id} />
                    )}
                    {capabilities.canChat && (
                    <ChatButton
                      targetUserId={post.user_id}
                      variant="outline"
                      size="sm"
                      shareCard={{
                        type: 'post',
                        id: post.id,
                        title: post.content ? post.content.slice(0, 50) : '帖子',
                        image: post.image_urls?.[0],
                        url: `/post/${post.id}`,
                      }}
                    >
                      {tMessages('chatWithAuthor')}
                    </ChatButton>
                    )}
                    {capabilities.canReport && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!user) {
                            showInfo(t('pleaseLoginToReport'))
                            return
                          }
                          setShowReportDialog(true)
                        }}
                        title={t('report')}
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Story/Series 元信息：章节号、字数 */}
            {(postType === 'story' || postType === 'series') && storyInfo && (storyInfo.chapter_number != null || storyInfo.content_length != null) && (
              <p className="text-sm text-muted-foreground">
                {storyInfo.chapter_number != null && `${t('chapterShort')}${storyInfo.chapter_number} `}
                {storyInfo.content_length != null && ` · ${t('wordCountWithUnit', { count: storyInfo.content_length })}`}
              </p>
            )}

            {/* Content Description（按 locale 显示原文或译文） */}
            {(post.content || post.content_translated) && (
              <div className="space-y-2 min-w-0 overflow-hidden">
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
                  {getDisplayContent(locale, post.content_lang ?? null, post.content, post.content_translated)}
                </p>
              </div>
            )}

            {/* Topics - moved below content */}
            {post.topics && post.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 min-w-0">
                {post.topics.map((topic) => (
                  <TopicTag key={topic.id} topic={topic} />
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t min-w-0 overflow-visible">
              <LikeButton
                postId={post.id}
                initialLikes={post.like_count}
                enabled={capabilities.canLike}
              />
              <Button variant="ghost" size="sm" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                <span className="text-sm">{post.comment_count}</span>
              </Button>
              {capabilities.canRepost && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={handleRepost}
                  disabled={repostMutation.isPending}
                >
                  <Repeat2 className="h-4 w-4" />
                  <span className="text-sm">{post.repost_count || 0}</span>
                </Button>
              )}
              <FavoriteButton
                postId={post.id}
                initialFavorites={post.favorite_count ?? 0}
                enabled={capabilities.canLike}
              />
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
                <span className="text-sm">{post.share_count || 0}</span>
              </Button>
            </div>

            {/* Tip Button */}
            <div className="pt-2 border-t min-w-0">
              <TipButton
                postId={post.id}
                postAuthorId={post.user_id}
                currentAmount={post.tip_amount || 0}
                enabled={capabilities.canTip}
                reasonDisabled={tipDisabledReason}
                authorizationToken={authorizationToken?.token}
              />
            </div>

            {/* 带货商品 - 单行简洁展示 */}
            {(post.linkedProducts && post.linkedProducts.length > 0) && (
              <div className="pt-3 border-t min-w-0">
                {post.linkedProducts
                  .filter((lp) => lp.product)
                  .slice(0, 1)
                  .map((lp) => (
                    <button
                      key={lp.product_id}
                      onClick={async () => {
                        // 🔒 先记录点击，再跳转
                        try {
                          await fetch('/api/affiliate/clicks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ affiliate_post_id: postId }),
                            credentials: 'include'
                          })
                        } catch (e) {
                          // 静默失败
                        }
                        router.push(`/product/${lp.product!.id}?ap=${postId}`)
                      }}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors w-full text-left"
                    >
                      <span className="text-lg">💰</span>
                      <span className="text-sm text-muted-foreground">{tAffiliate('promoted') || '推广'}:</span>
                      {lp.product!.images?.[0] ? (
                        <img
                          src={lp.product!.images[0]}
                          alt={lp.product!.name}
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
                          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {getDisplayContent(
                            locale,
                            lp.product!.content_lang ?? null,
                            lp.product!.name,
                            lp.product!.name_translated
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-primary">
                        {formatPriceWithConversion(lp.product!.price, (lp.product!.currency || 'CNY') as Currency, userCurrency).main}
                      </span>
                      <span className="text-muted-foreground">›</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Comments Section */}
            <div className="pt-4 border-t min-w-0 overflow-visible">
              <h2 className="mb-4 text-lg font-semibold break-words">{t('comments')}</h2>
              <div className="min-w-0 overflow-visible">
                <CommentSection
                  postId={postId}
                  enabled={capabilities.canComment}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 举报对话框 */}
      <ReportDialog
        open={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        reportedType="post"
        reportedId={postId}
      />

      {/* 转发对话框 */}
      <RepostDialog
        open={showRepostDialog}
        onClose={() => setShowRepostDialog(false)}
        onConfirm={handleRepostConfirm}
        isLoading={repostMutation.isPending}
      />

      {/* 分享对话框 */}
      <ShareDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        url={`${typeof window !== 'undefined' ? window.location.origin : ''}/post/${postId}`}
        title={post?.content || '查看这个帖子'}
        description={post?.content || undefined}
        image={post?.image_urls?.[0]}
        itemType="post"
        itemId={postId}
      />
    </div>
  )
}
