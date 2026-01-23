'use client'

import { useQueryClient } from '@tanstack/react-query'
import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { PostCard } from '@/components/social/PostCard'
import { PostCardSkeleton } from '@/components/ui/skeleton'
import { RetryableError } from '@/components/error/RetryableError'
import { usePosts } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { OnboardingGuide } from '@/components/onboarding/OnboardingGuide'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = usePosts('approved', {
    enabled: !authLoading, // 等待认证状态加载完成
  })
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  // 显示认证加载状态
  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-6 text-2xl font-bold">{t('discover')}</h1>
        <MasonryGrid>
          {[...Array(6)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </MasonryGrid>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-6 text-2xl font-bold">{t('discover')}</h1>
        <MasonryGrid>
          {[...Array(6)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </MasonryGrid>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-6 text-2xl font-bold">{t('discover')}</h1>
        <RetryableError 
          error={error} 
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['posts', 'approved'] })}
          title={user ? t('loadFailed') : t('guestLoadFailed')}
        />
        {!user && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('guestLoadFailedMessage')}
          </p>
        )}
      </div>
    )
  }

  const posts = data?.pages.flatMap((page) => page) || []

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <OnboardingGuide />
      <h1 className="mb-6 text-2xl font-bold">{t('discover')}</h1>
      {posts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {user ? (
            <p>{t('noContentMessage')}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-base">{t('guestEmptyMessage')}</p>
              <Link href="/register">
                <Button>{t('registerToSeeMore')}</Button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="-mx-2 sm:-mx-4 md:mx-0">
          <MasonryGrid>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </MasonryGrid>
        </div>
      )}
      {hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
          >
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
      )}
    </div>
  )
}
