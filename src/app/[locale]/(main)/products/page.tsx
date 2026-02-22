'use client'

import { useProducts } from '@/lib/hooks/useProducts'
import { ProductCard } from '@/components/ecommerce/ProductCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, ShoppingBag } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function ProductsPage() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useProducts()
  const t = useTranslations('products')
  const tCommon = useTranslations('common')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('loadFailed')}</p>
      </div>
    )
  }

  const products = data?.pages.flatMap((page) => page) || []

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('productCenter')}</h1>
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
          {hasNextPage && (
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
          )}
        </>
      )}
    </div>
  )
}
