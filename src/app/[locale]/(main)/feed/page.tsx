'use client'

import { MasonryGrid } from '@/components/layout/MasonryGrid'
import { PostCard } from '@/components/social/PostCard'
import { usePosts } from '@/lib/hooks/usePosts'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTranslations } from 'next-intl'

export default function FeedPage() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = usePosts('approved')
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('loadFailed')}</p>
      </div>
    )
  }

  const posts = data?.pages.flatMap((page) => page) || []

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('feedPage')}</h1>
      {posts.length === 0 ? (
        <EmptyState title={t('noContent')} />
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
