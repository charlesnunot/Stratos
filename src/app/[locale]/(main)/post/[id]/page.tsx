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
import { Loader2, MessageCircle, Share2, ChevronLeft, ChevronRight, Flag, Repeat2, ShoppingBag } from 'lucide-react'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useParams } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { useRepost } from '@/lib/hooks/useRepost'
import { useTrackView } from '@/lib/hooks/useTrackView'
import { RepostDialog } from '@/components/social/RepostDialog'
import { ShareDialog } from '@/components/social/ShareDialog'
import { showSuccess, showInfo, showError, showWarning } from '@/lib/utils/toast'
import { useTranslations } from 'next-intl'
import { usePostPage } from '@/lib/hooks/usePostPage'

export default function PostPage() {
  const params = useParams()
  const postId = params.id as string
  const state = usePostPage(postId)
  const t = useTranslations('posts')
  const tMessages = useTranslations('messages')
  const tCommon = useTranslations('common')
  const tAffiliate = useTranslations('affiliate')
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [showRepostDialog, setShowRepostDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  
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

  const { post, user, capabilities } = state

  const images = post.image_urls || []
  const hasMultipleImages = images.length > 1

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
        {/* Left Column: Image Display */}
        <div className="min-w-0">
          {images.length > 0 ? (
            <div className="relative w-full max-w-full overflow-hidden rounded-lg bg-muted">
              <div className="relative aspect-[4/3] w-full md:min-h-[600px]">
                <img
                  src={images[currentImageIndex]}
                  alt={post.content || 'Post image'}
                  className="h-full w-full max-w-full object-contain"
                  loading="eager"
                />
                
                {/* Image Navigation */}
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
                    
                    {/* Image Indicators */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                      {images.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentImageIndex(index)}
                          className={`h-2 rounded-full transition-all ${
                            index === currentImageIndex
                              ? 'w-8 bg-white'
                              : 'w-2 bg-white/50 hover:bg-white/70'
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
                    {/* ChatButton 目前仍主要依赖自身内部登录与校验逻辑，仅按是否为作者本人做控制 */}
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

            {/* Content Description */}
            {post.content && (
              <div className="space-y-2 min-w-0 overflow-hidden">
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
                  {post.content}
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
              />
            </div>

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
