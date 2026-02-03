'use client'

import { useState } from 'react'
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
import { Loader2, MessageCircle, Share2, ChevronLeft, ChevronRight, Flag, Repeat2, ShoppingBag, Upload } from 'lucide-react'
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
import { useQueryClient } from '@tanstack/react-query'
import { usePostPage } from '@/lib/hooks/usePostPage'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/currency/format-currency'

export default function PostPage() {
  const params = useParams()
  const postId = params.id as string
  const state = usePostPage(postId)
  const queryClient = useQueryClient()
  const { user: authUser } = useAuth()
  const supabase = createClient()
  const { data: currentProfileData } = useProfile(authUser?.id ?? '')
  const isAdminOrSupport =
    currentProfileData?.profile?.role === 'admin' || currentProfileData?.profile?.role === 'support'
  const t = useTranslations('posts')
  const tMessages = useTranslations('messages')
  const tCommon = useTranslations('common')
  const tAffiliate = useTranslations('affiliate')
  const locale = useLocale()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [migrateLoading, setMigrateLoading] = useState(false)
  
  // 转发相关
  const repostMutation = useRepost()

  // PV/UV 统计（含匿名）：仅在 ready 且帖子已审核时上报
  useTrackView(
    state.status === 'ready' && state.post?.status === 'approved' ? 'post' : null,
    state.status === 'ready' && state.post?.status === 'approved' ? postId : null
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

  const { post, user, capabilities, tipDisabledReason } = state

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

  const handleMigrateImages = async () => {
    if (migrateLoading) return
    setMigrateLoading(true)
    try {
      const res = await fetch('/api/cloudinary/migrate-post-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body?.ok) {
        showSuccess(t('migrateImagesSuccess', { count: body.migrated ?? 0 }))
        queryClient.invalidateQueries({ queryKey: ['post', postId] })
      } else {
        showError(body?.error ?? t('migrateImagesFailed'))
      }
    } catch {
      showError(t('migrateImagesFailed'))
    } finally {
      setMigrateLoading(false)
    }
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
              <div className="relative w-full" style={{ aspectRatio: '9/16', maxHeight: 'min(80vh, 600px)' }}>
                <video
                  src={videoInfo.video_url}
                  poster={videoInfo.cover_url || images[0] || undefined}
                  controls
                  className="h-full w-full object-contain"
                  preload="metadata"
                />
              </div>
              <Link
                href={`/post/${postId}/video`}
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                {t('enterVideoStream')}
              </Link>
            </div>
          ) : postType === 'music' && musicInfo?.music_url ? (
            <div className="relative w-full max-w-full overflow-hidden rounded-lg bg-muted">
              <div className="relative aspect-video w-full md:min-h-[300px] flex flex-col items-center justify-center p-4">
                {(musicInfo.cover_url || images[0]) ? (
                  <img src={musicInfo.cover_url || images[0]} alt="" className="w-full max-h-[50vh] object-contain rounded" />
                ) : (
                  <span className="text-muted-foreground text-4xl mb-2">♪</span>
                )}
                <audio src={musicInfo.music_url} controls className="w-full mt-4 max-w-md" preload="metadata" />
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
                  src={images[currentImageIndex]}
                  alt={post.content || 'Post image'}
                  className="h-full w-full max-w-full object-contain"
                  loading="eager"
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
                        src={post.user.avatar_url}
                        alt={post.user.display_name}
                        className="h-full w-full object-cover"
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
              {isAdminOrSupport && images.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleMigrateImages}
                  disabled={migrateLoading}
                  title={t('migrateImages')}
                >
                  {migrateLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span className="text-sm">{t('migrateImages')}</span>
                </Button>
              )}
            </div>

            {/* Tip Button */}
            <div className="pt-2 border-t min-w-0">
              <TipButton
                postId={post.id}
                postAuthorId={post.user_id}
                currentAmount={post.tip_amount || 0}
                enabled={capabilities.canTip}
                reasonDisabled={tipDisabledReason}
              />
            </div>

            {/* 关联商品（帖子内嵌） */}
            {post.linkedProducts && post.linkedProducts.length > 0 && (
              <div className="pt-4 border-t min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">{t('linkedProducts')}</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {post.linkedProducts
                    .filter((lp) => lp.product)
                    .map((lp) => (
                      <ProductCard
                        key={lp.product_id}
                        product={{
                          id: lp.product!.id,
                          name: lp.product!.name,
                          description: null,
                          price: lp.product!.price,
                          images: lp.product!.images ?? [],
                          seller_id: lp.product!.seller_id,
                          stock: 0,
                          status: 'active',
                          like_count: 0,
                          want_count: 0,
                          share_count: 0,
                          repost_count: 0,
                          favorite_count: 0,
                        }}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Affiliate Product */}
            {post.affiliatePost?.product && (() => {
              const p = post.affiliatePost.product as Record<string, unknown>
              return (
                <div className="pt-4 border-t min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingBag className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">{t('promotedProduct')}</h3>
                  </div>
                  <ProductCard
                    product={{
                      id: String(p.id ?? ''),
                      name: String(p.name ?? ''),
                      description: p.description != null ? String(p.description) : null,
                      price: Number(p.price ?? 0),
                      images: Array.isArray(p.images) ? (p.images as string[]) : [],
                      seller_id: String(p.seller_id ?? ''),
                      stock: 0,
                      status: 'active',
                      like_count: 0,
                      want_count: 0,
                      share_count: 0,
                      repost_count: 0,
                      favorite_count: 0,
                      ...(p.seller ? { seller: p.seller as { username: string; display_name: string; avatar_url: string | null } } : {}),
                    }}
                  />
                </div>
              )
            })()}

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
