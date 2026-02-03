'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useVideoStream } from '@/lib/hooks/usePosts'
import type { Post } from '@/lib/hooks/usePosts'
import { Button } from '@/components/ui/button'
import { LikeButton } from '@/components/social/LikeButton'
import { FavoriteButton } from '@/components/social/FavoriteButton'
import { Link } from '@/i18n/navigation'
import { ChevronUp, ChevronDown, ArrowLeft, MessageCircle } from 'lucide-react'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTranslations } from 'next-intl'

export default function PostVideoStreamPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string
  const { data, isLoading, error, fetchOlder, fetchNewer } = useVideoStream(postId)
  const [list, setList] = useState<Post[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingNewer, setLoadingNewer] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  useEffect(() => {
    if (data?.posts?.length) {
      setList(data.posts)
      setCurrentIndex(Math.min(data.currentIndex, data.posts.length - 1))
    }
  }, [data?.posts, data?.currentIndex])

  const post = list[currentIndex]
  const videoInfo = post && (post as Post).post_type === 'short_video' ? (post as Post).video_info : null

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* 当前条视频：全屏竖版 */}
      <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center">
        {videoInfo?.video_url ? (
          <video
            ref={videoRef}
            src={videoInfo.video_url}
            poster={videoInfo.cover_url || (post as Post).image_urls?.[0] || undefined}
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

        {/* 顶部：返回 */}
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
        </div>

        {/* 右侧：作者、点赞、评论 */}
        {post?.user && (
          <div className="absolute right-4 bottom-24 flex flex-col items-center gap-4">
            <Link
              href={`/profile/${(post as Post).user_id}`}
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
            <div className="flex flex-col gap-3">
              <LikeButton postId={(post as Post).id} initialLikes={(post as Post).like_count ?? 0} enabled />
              <Link href={`/post/${(post as Post).id}`} className="flex flex-col items-center gap-0 text-white">
                <MessageCircle className="h-8 w-8" />
                <span className="text-xs">{(post as Post).comment_count ?? 0}</span>
              </Link>
              <FavoriteButton postId={(post as Post).id} initialFavorites={(post as Post).favorite_count ?? 0} enabled />
            </div>
          </div>
        )}

        {/* 底部：文案摘要（可选） */}
        {(post as Post).content && (
          <div className="absolute left-4 right-16 bottom-4 text-white text-sm line-clamp-2 drop-shadow">
            {(post as Post).content}
          </div>
        )}

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
    </div>
  )
}
