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
import { Link } from '@/i18n/navigation'
import { OnboardingGuide } from '@/components/onboarding/OnboardingGuide'
import { useMemo } from 'react'
import type { Post } from '@/lib/hooks/usePosts'
import Image from 'next/image'
import { Card } from '@/components/ui/card'

interface Product {
  id: string
  name: string
  images: string[]
  price: number
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
  
  // 确保 hydration 一致性：在 auth 加载期间使用 server 传递的 initialUser 和 initialSubscriptionType
  // 这样可以避免 server 渲染 user=null 和 client hydration 时短暂显示不同状态
  const effectiveUser = authLoading ? initialUser : user
  
  // 使用 server 传递的 subscriptionType 确保 hydration 一致性
  // 注意：这里我们使用 server 传递的值，而不是从 client 查询，以避免 hydration mismatch
  const effectiveSubscriptionType = initialSubscriptionType
  const isSeller = initialSellerEnabled
  const effectiveTipEnabled = initialTipEnabled
  const isAffiliate = initialAffiliateEnabled
  
  // Use React Query with initial data from server
  // 如果有初始数据，立即启用查询以显示内容，不等待 auth 加载完成
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = usePosts('approved', {
    enabled: !authLoading || initialPosts.length > 0, // 有初始数据时立即启用
    initialData: initialPosts.length > 0 ? {
      pages: [initialPosts],
      pageParams: [0],
    } : undefined,
  })

  // 动态计算骨架屏数量（根据视口高度）
  const skeletonCount = useMemo(() => {
    if (typeof window === 'undefined') return 6
    const viewportHeight = window.innerHeight
    const estimatedCardHeight = 400
    const count = Math.ceil(viewportHeight / estimatedCardHeight) * 2
    return Math.max(6, Math.min(12, count))
  }, [])

  // 显示认证加载状态（仅在没有任何初始数据时显示骨架屏）
  // 如果有初始数据，立即显示内容，避免闪烁
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

  // Use server error if available, otherwise use client error
  const displayError = initialError || error

  if (displayError && (!data || data.pages.flat().length === 0)) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-6 text-2xl font-bold">{translations.discover}</h1>
        <RetryableError 
          error={displayError} 
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['posts', 'approved'] })}
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

  const posts = data?.pages.flatMap((page) => page) || initialPosts

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <OnboardingGuide />
      
      {/* 卖家入口提示 */}
      {isSeller && effectiveUser && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100">卖家中心</h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">管理您的商品和订单</p>
            </div>
            <div className="flex gap-2">
              {sellerProducts.length > 0 && (
                <Link href="/seller/products">
                  <Button variant="outline" size="sm" className="border-blue-600 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950">
                    管理 {sellerProducts.length} 个商品
                  </Button>
                </Link>
              )}
              <Link href="/seller/dashboard">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
                  进入卖家中心
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
      
      {/* 打赏功能提示 */}
      {effectiveTipEnabled && effectiveUser && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-green-900 dark:text-green-100">打赏功能已启用</h3>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">您可以为喜欢的创作者打赏支持</p>
            </div>
            <Link href="/subscription/tip">
              <Button size="sm" variant="outline" className="border-green-600 text-green-700 hover:bg-green-100 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950">
                管理订阅
              </Button>
            </Link>
          </div>
        </div>
      )}
      
      {/* 带货功能提示 */}
      {isAffiliate && effectiveUser && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-semibold text-purple-900 dark:text-purple-100">带货功能已启用</h3>
              <p className="mt-1 text-sm text-purple-700 dark:text-purple-300">推广商品赚取佣金</p>
            </div>
            <Link href="/affiliate/products">
              <Button size="sm" variant="outline" className="border-purple-600 text-purple-700 hover:bg-purple-100 dark:border-purple-500 dark:text-purple-400 dark:hover:bg-purple-950">
                进入带货中心
              </Button>
            </Link>
          </div>
          {/* 显示可推广商品预览 */}
          {affiliateProducts.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-purple-700 dark:text-purple-300 mb-2">
                可推广 {affiliateProducts.length} 个商品
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
                      <p className="text-xs text-muted-foreground">¥{product.price.toFixed(2)}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      <h1 className="mb-6 text-2xl font-bold">{translations.discover}</h1>
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
                {translations.loading}
              </>
            ) : (
              translations.loadingMore
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
