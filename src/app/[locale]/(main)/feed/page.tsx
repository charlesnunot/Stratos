'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { PostCardUnit } from '@/components/social/PostCardUnit'
import { PostCardSkeleton } from '@/components/ui/skeleton'
import { RetryableError } from '@/components/error/RetryableError'
import { usePosts, useFeed, recordFeedImpressions } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTranslations } from 'next-intl'
import { mapFeedPostToListPostDTO } from '@/lib/post-card/mappers'

const MAX_AUTO_RETRY = 2

export default function FeedPage() {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const feedQuery = useFeed(user?.id, { enabled: !authLoading && !!user })
  const postsQuery = usePosts('approved', { enabled: !authLoading && !user })
  const data = user ? feedQuery.data : postsQuery.data
  const fetchNextPage = user ? feedQuery.fetchNextPage : postsQuery.fetchNextPage
  const hasNextPage = user ? feedQuery.hasNextPage : postsQuery.hasNextPage
  const isFetchingNextPage = user ? feedQuery.isFetchingNextPage : postsQuery.isFetchingNextPage
  const isLoading = user ? feedQuery.isLoading : postsQuery.isLoading
  const error = user ? feedQuery.error : postsQuery.error

  const posts = data?.pages?.flatMap((p) => p) ?? []
  const hasData = posts.length > 0

  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  const recordedIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!user || !data?.pages?.length) return
    const ids = data.pages.flatMap((p) => p.map((post) => post.id)).filter((id) => !recordedIds.current.has(id))
    if (ids.length === 0) return
    recordFeedImpressions(user.id, ids)
    ids.forEach((id) => recordedIds.current.add(id))
  }, [user, data?.pages])

  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const el = loadMoreRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage()
      },
      { rootMargin: '200px', threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const [retryCount, setRetryCount] = useState(0)
  useEffect(() => {
    if (!error) setRetryCount(0)
  }, [error])
  useEffect(() => {
    if (!error || retryCount >= MAX_AUTO_RETRY) return
    const key = user ? ['feed', user.id] : ['posts', 'approved']
    const delay = (retryCount + 1) * 1000
    const id = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: key })
      setRetryCount((c) => c + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [error, user, queryClient, retryCount])

  const skeletonCount = useMemo(() => {
    if (typeof window === 'undefined') return 6
    const viewportHeight = window.innerHeight
    return Math.max(6, Math.min(12, Math.ceil(viewportHeight / 400) * 2))
  }, [])

  const handleRetry = () => {
    setRetryCount(0)
    queryClient.invalidateQueries({ queryKey: user ? ['feed', user.id] : ['posts', 'approved'] })
  }

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('feedPage')}</h1>
        <MasonryGrid>
          {[...Array(skeletonCount)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </MasonryGrid>
      </div>
    )
  }

  if (error && !hasData) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('feedPage')}</h1>
        <RetryableError error={error} onRetry={handleRetry} title={t('loadFailed')} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('feedPage')}</h1>
      {error && hasData && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm text-destructive">{t('loadFailed')}</span>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {tCommon('retry')}
          </Button>
        </div>
      )}
      {posts.length === 0 ? (
        <EmptyState title={t('noContent')} />
      ) : (
        <div className="-mx-2 sm:-mx-4 md:mx-0">
          <MasonryGrid>
            {posts.map((post) => (
              <PostCardUnit key={post.id} dto={mapFeedPostToListPostDTO(post)} />
            ))}
          </MasonryGrid>
        </div>
      )}
      {hasNextPage && posts.length > 0 && (
        <>
          <div ref={loadMoreRef} className="h-1 w-full" aria-hidden />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} variant="outline">
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('loading')}
                </>
              ) : (
                t('loadingMore')
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
