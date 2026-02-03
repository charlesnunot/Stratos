'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProducts, useProductFeed } from '@/lib/hooks/useProducts'
import { useAuth } from '@/lib/hooks/useAuth'
import { ProductCard } from '@/components/ecommerce/ProductCard'
import { ProductCardSkeleton } from '@/components/ui/skeleton'
import { RetryableError } from '@/components/error/RetryableError'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, RefreshCw, ShoppingBag } from 'lucide-react'
import { useTranslations } from 'next-intl'

const MAX_AUTO_RETRY = 2

export default function ProductsPage() {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const feedQuery = useProductFeed(user?.id, undefined, { enabled: !authLoading && !!user })
  const productsQuery = useProducts(undefined, { enabled: !authLoading && !user })
  const data = user ? feedQuery.data : productsQuery.data
  const fetchNextPage = user ? feedQuery.fetchNextPage : productsQuery.fetchNextPage
  const hasNextPage = user ? feedQuery.hasNextPage : productsQuery.hasNextPage
  const isFetchingNextPage = user ? feedQuery.isFetchingNextPage : productsQuery.isFetchingNextPage
  const isLoading = user ? feedQuery.isLoading : productsQuery.isLoading
  const error = user ? feedQuery.error : productsQuery.error

  const products = data?.pages?.flatMap((p) => p) ?? []
  const hasData = products.length > 0

  const t = useTranslations('products')
  const tCommon = useTranslations('common')

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
    const key = user ? ['productFeed', user.id, undefined] : ['products', 'active', undefined]
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
    return Math.max(6, Math.min(12, Math.ceil(viewportHeight / 400) * 3))
  }, [])

  const handleRetry = () => {
    setRetryCount(0)
    queryClient.invalidateQueries({
      queryKey: user ? ['productFeed', user.id, undefined] : ['products', 'active', undefined],
    })
  }

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('productCenter')}</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(skeletonCount)].map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error && !hasData) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4">
        <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('productCenter')}</h1>
        <RetryableError error={error} onRetry={handleRetry} title={t('loadFailed')} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('productCenter')}</h1>
      {error && hasData && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm text-destructive">{t('loadFailed')}</span>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {tCommon('retry')}
          </Button>
        </div>
      )}
      {products.length === 0 ? (
        <Card className="p-12 text-center">
          <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t('noProductsMessage')}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {hasNextPage && products.length > 0 && (
            <>
              <div ref={loadMoreRef} className="h-1 w-full" aria-hidden />
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage || !hasNextPage}
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
            </>
          )}
        </>
      )}
    </div>
  )
}
