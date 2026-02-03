'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { PostCardUnit } from '@/components/social/PostCardUnit'
import { PostCardSkeleton } from '@/components/ui/skeleton'
import { RetryableError } from '@/components/error/RetryableError'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'
import { useFeed, recordFeedImpressions } from '@/lib/hooks/usePosts'
import { mapFeedPostToListPostDTO } from '@/lib/post-card/mappers'
import { useTranslations } from 'next-intl'

const MAX_AUTO_RETRY = 2

export default function FollowingPage() {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const supabase = createClient()
  const t = useTranslations('following')
  const tCommon = useTranslations('common')
  const tPosts = useTranslations('posts')

  const { data: following } = useQuery({
    queryKey: ['following', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('follows')
        .select('followee_id')
        .eq('follower_id', user.id)
      if (error) throw error
      return (data || []).map((f) => f.followee_id) as string[]
    },
    enabled: !authLoading && !!user,
  })

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useFeed(user?.id, {
    followedOnly: true,
    enabled: !authLoading && !!user,
  })

  const followingPosts = data?.pages?.flatMap((p) => p) ?? []
  const hasData = followingPosts.length > 0

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
    const key = ['feed', user?.id, true]
    const delay = (retryCount + 1) * 1000
    const id = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: key })
      setRetryCount((c) => c + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [error, user?.id, queryClient, retryCount])

  const skeletonCount = useMemo(() => {
    if (typeof window === 'undefined') return 6
    const viewportHeight = window.innerHeight
    return Math.max(6, Math.min(12, Math.ceil(viewportHeight / 400) * 2))
  }, [])

  const handleRetry = () => {
    setRetryCount(0)
    queryClient.invalidateQueries({ queryKey: ['feed', user?.id, true] })
  }

  if (!user && !authLoading) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t('pleaseLogin')}</p>
      </div>
    )
  }

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('pageTitle')}</h1>
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
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('pageTitle')}</h1>
        <RetryableError error={error} onRetry={handleRetry} title={t('loadError')} />
      </div>
    )
  }

  if (following && following.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('pageTitle')}</h1>
        <Card className="p-8 text-center">
          <p className="mb-4 text-muted-foreground">{t('notFollowingAnyone')}</p>
          <p className="text-sm text-muted-foreground">{t('discoverMessage')}</p>
        </Card>
      </div>
    )
  }

  if (followingPosts.length === 0 && !error && following && following.length > 0) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('pageTitle')}</h1>
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{t('noPostsFromFollowing')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('pageTitle')}</h1>
      {error && hasData && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm text-destructive">{t('loadError')}</span>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {tCommon('retry')}
          </Button>
        </div>
      )}
      <div className="-mx-2 sm:-mx-4 md:mx-0">
        <MasonryGrid>
          {followingPosts.map((post) => (
            <PostCardUnit key={post.id} dto={mapFeedPostToListPostDTO(post)} />
          ))}
        </MasonryGrid>
      </div>
      {hasNextPage && followingPosts.length > 0 && (
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
                tPosts('loadingMore')
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
