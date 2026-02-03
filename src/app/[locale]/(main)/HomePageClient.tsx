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
import { Link } from '@/i18n/navigation'
import { OnboardingGuide } from '@/components/onboarding/OnboardingGuide'
import type { Post } from '@/lib/hooks/usePosts'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { mapFeedPostToListPostDTO } from '@/lib/post-card/mappers'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { useLocale, useTranslations } from 'next-intl'

interface Product {
  id: string
  name: string
  images: string[]
  price: number
  currency?: string
  seller?: {
    username: string
    display_name: string
  }
}

interface HomePageClientProps {
  initialPosts: Post[]
  initialError: any
  user: { id: string } | null
  subscriptionType: string | null
  tipEnabled?: boolean
  sellerEnabled?: boolean
  affiliateEnabled?: boolean
  affiliateProducts?: Product[]
  sellerProducts?: Product[]
  translations: {
    discover: string
    loadFailed: string
    guestLoadFailed: string
    guestLoadFailedMessage: string
    noContentMessage: string
    guestEmptyMessage: string
    registerToSeeMore: string
    loadingMore: string
    loading: string
    retry: string
  }
}

export function HomePageClient({ 
  initialPosts, 
  initialError, 
  user: initialUser,
  subscriptionType: initialSubscriptionType,
  tipEnabled: initialTipEnabled = false,
  sellerEnabled: initialSellerEnabled = false,
  affiliateEnabled: initialAffiliateEnabled = false,
  affiliateProducts = [],
  sellerProducts = [],
  translations 
}: HomePageClientProps) {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const locale = useLocale()
  const tHome = useTranslations('home')
  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
  
  // 确保 hydration 一致性：在 auth 加载期间使用 server 传递的 initialUser 和 initialSubscriptionType
  // 这样可以避免 server 渲染 user=null 和 client hydration 时短暂显示不同状态
  const effectiveUser = authLoading ? initialUser : user
  const isLoggedIn = !!effectiveUser

  const effectiveSubscriptionType = initialSubscriptionType
  const isSeller = initialSellerEnabled
  const effectiveTipEnabled = initialTipEnabled
  const isAffiliate = initialAffiliateEnabled

  const feedQuery = useFeed(effectiveUser?.id, { enabled: !authLoading && !!effectiveUser })
  const postsQuery = usePosts('approved', {
    enabled: !authLoading && !effectiveUser,
    initialData: initialPosts.length > 0 ? { pages: [initialPosts], pageParams: [0] } : undefined,
  })

  const data = isLoggedIn ? feedQuery.data : postsQuery.data
  const fetchNextPage = isLoggedIn ? feedQuery.fetchNextPage : postsQuery.fetchNextPage
  const hasNextPage = isLoggedIn ? feedQuery.hasNextPage : postsQuery.hasNextPage
  const isFetchingNextPage = isLoggedIn ? feedQuery.isFetchingNextPage : postsQuery.isFetchingNextPage
  const isLoading = isLoggedIn ? feedQuery.isLoading : postsQuery.isLoading
  const error = isLoggedIn ? feedQuery.error : postsQuery.error

  const recordedIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!effectiveUser || !data?.pages?.length) return
    const ids = data.pages.flatMap((p) => p.map((post: Post) => post.id)).filter((id: string) => !recordedIds.current.has(id))
    if (ids.length === 0) return
    recordFeedImpressions(effectiveUser.id, ids)
    ids.forEach((id: string) => recordedIds.current.add(id))
  }, [effectiveUser, data?.pages])

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
  const MAX_AUTO_RETRY = 2
  useEffect(() => {
    if (!error || retryCount >= MAX_AUTO_RETRY) return
    const key = isLoggedIn ? ['feed', effectiveUser?.id] : ['posts', 'approved']
    const delay = (retryCount + 1) * 1000
    const id = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: key })
      setRetryCount((c) => c + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [error, isLoggedIn, effectiveUser?.id, queryClient, retryCount])

  // 动态计算骨架屏数量（根据视口高度）
  const skeletonCount = useMemo(() => {
    if (typeof window === 'undefined') return 6
    const viewportHeight = window.innerHeight
    const estimatedCardHeight = 400
    const count = Math.ceil(viewportHeight / estimatedCardHeight) * 2
    return Math.max(6, Math.min(12, count))
  }, [])

  if (authLoading && initialPosts.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-6 text-2xl font-bold">{translations.discover}</h1>
        <MasonryGrid>
          {[...Array(skeletonCount)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </MasonryGrid>
      </div>
    )
  }
  if (!authLoading && isLoggedIn && isLoading && !data?.pages?.length) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-6 text-2xl font-bold">{translations.discover}</h1>
        <MasonryGrid>
          {[...Array(skeletonCount)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </MasonryGrid>
      </div>
    )
  }

  const displayError = initialError || error
  const posts = data?.pages.flatMap((page) => page) || initialPosts
  const hasData = posts.length > 0

  if (displayError && !hasData) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-6 text-2xl font-bold">{translations.discover}</h1>
        <RetryableError
          error={displayError}
          onRetry={() => {
            setRetryCount(0)
            queryClient.invalidateQueries({ queryKey: isLoggedIn ? ['feed', effectiveUser?.id] : ['posts', 'approved'] })
          }}
          title={effectiveUser ? translations.loadFailed : translations.guestLoadFailed}
        />
        {!effectiveUser && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {translations.guestLoadFailedMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <OnboardingGuide />
      
      {isSeller && effectiveUser && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100">{tHome('sellerCenter')}</h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">{tHome('sellerCenterDescription')}</p>
            </div>
            <div className="flex gap-2">
              {sellerProducts.length > 0 && (
                <Link href="/seller/products">
                  <Button variant="outline" size="sm" className="border-blue-600 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950">
                    {tHome('manageNProducts', { count: sellerProducts.length })}
                  </Button>
                </Link>
              )}
              <Link href="/seller/dashboard">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
                  {tHome('enterSellerCenter')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
      
      {effectiveTipEnabled && effectiveUser && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-green-900 dark:text-green-100">{tHome('tipEnabled')}</h3>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">{tHome('tipEnabledDescription')}</p>
            </div>
            <Link href="/subscription/tip">
              <Button size="sm" variant="outline" className="border-green-600 text-green-700 hover:bg-green-100 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950">
                {tHome('manageSubscription')}
              </Button>
            </Link>
          </div>
        </div>
      )}
      
      {isAffiliate && effectiveUser && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-purple-900 dark:text-purple-100">{tHome('affiliateEnabled')}</h3>
              <p className="mt-1 text-sm text-purple-700 dark:text-purple-300">{tHome('affiliateEnabledDescription')}</p>
            </div>
            <Link href="/affiliate/products">
              <Button size="sm" variant="outline" className="border-purple-600 text-purple-700 hover:bg-purple-100 dark:border-purple-500 dark:text-purple-400 dark:hover:bg-purple-950">
                {tHome('enterAffiliateCenter')}
              </Button>
            </Link>
          </div>
          {affiliateProducts.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-purple-700 dark:text-purple-300 mb-2">
                {tHome('affiliateProductsCount', { count: affiliateProducts.length })}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {affiliateProducts.slice(0, 5).map((product) => (
                  <Link key={product.id} href={`/affiliate/products/${product.id}/promote`}>
                    <Card className="p-2 min-w-[120px] hover:shadow-md transition-shadow cursor-pointer">
                      {product.images?.[0] && (
                        <div className="relative w-full aspect-square mb-2">
                          <Image 
                            src={product.images[0]} 
                            alt={product.name} 
                            fill
                            className="object-cover rounded"
                            sizes="120px"
                          />
                        </div>
                      )}
                      <p className="text-xs mt-1 truncate font-medium">{product.name}</p>
                      {(() => {
                        const pd = formatPriceWithConversion(product.price, (product.currency as Currency) || 'USD', userCurrency)
                        return <p className="text-xs text-muted-foreground">{pd.main}</p>
                      })()}
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      <h1 className="mb-6 text-2xl font-bold">{translations.discover}</h1>
      {displayError && hasData && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm text-destructive">
            {effectiveUser ? translations.loadFailed : translations.guestLoadFailed}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRetryCount(0)
              queryClient.invalidateQueries({ queryKey: isLoggedIn ? ['feed', effectiveUser?.id] : ['posts', 'approved'] })
            }}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            {translations.retry}
          </Button>
        </div>
      )}
      {posts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {effectiveUser ? (
            <p>{translations.noContentMessage}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-base">{translations.guestEmptyMessage}</p>
              <Link href="/register">
                <Button>{translations.registerToSeeMore}</Button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="-mx-2 sm:-mx-4 md:mx-0">
            <MasonryGrid>
              {posts.map((post) => (
                <PostCardUnit key={post.id} dto={mapFeedPostToListPostDTO(post)} />
              ))}
            </MasonryGrid>
          </div>
          {!effectiveUser && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">{translations.registerToSeeMore}</p>
              <Link href="/register">
                <Button size="sm">{translations.registerToSeeMore}</Button>
              </Link>
            </div>
          )}
          {hasNextPage && (
            <>
              <div ref={loadMoreRef} className="h-1 w-full" aria-hidden />
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  variant="outline"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {translations.loading}
                    </>
                  ) : (
                    translations.loadingMore
                  )}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
