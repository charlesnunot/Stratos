'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/api/audit'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Edit, Trash2, Upload, Download } from 'lucide-react'
import { Link, useRouter, usePathname } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { BulkImportExport } from '@/components/products/BulkImportExport'
import { createImageErrorHandler } from '@/lib/utils/image-retry'

export default function SellerProductsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const locale = useLocale() as 'zh' | 'en'

  const handleImageError = createImageErrorHandler({
    maxRetries: 3,
    retryDelay: 1000,
    fallbackSrc: '/placeholder-product.png',
  })

  // Handle redirect to login when not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  // 使用 V2.3 统一鉴权系统的 SubscriptionContext
  const { isSeller, isDirectSeller, sellerTier } = useSubscription()

  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['sellerProducts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  // 3档纯净模式: 获取商品数量限制信息
  const [productLimitInfo, setProductLimitInfo] = useState<{
    currentCount: number
    productLimit: number
    remaining: number
    isDirectSeller: boolean
  } | null>(null)

  useEffect(() => {
    if (!user) return
    
    const fetchProductLimit = async () => {
      try {
        const response = await fetch('/api/seller/product-limit')
        if (response.ok) {
          const data = await response.json()
          setProductLimitInfo({
            currentCount: data.currentCount,
            productLimit: data.productLimit,
            remaining: data.remaining,
            isDirectSeller: data.isDirectSeller,
          })
        }
      } catch (error) {
        console.error('Error fetching product limit:', error)
      }
    }

    fetchProductLimit()
  }, [user])

  const handleDelete = async (productId: string) => {
    if (!confirm(tCommon('confirm') + '?')) return

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('seller_id', user!.id)

    if (error) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: tCommon('error') + ': ' + error.message,
      })
    } else {
      logAudit({
        action: 'delete_product',
        userId: user!.id,
        resourceId: productId,
        resourceType: 'product',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
      toast({
        variant: 'success',
        title: t('deleteSuccess'),
        description: t('productDeleted'),
      })
      refetch()
    }
  }

  // 使用 Context 中的 sellerTier
  const subscriptionTier = isDirectSeller ? 100 : (sellerTier || 0)

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show nothing if not authenticated (redirect is handled in useEffect)
  if (!user) {
    return null
  }

  // 获取卖家支付账户状态
  const { data: sellerPaymentStatus } = useQuery({
    queryKey: ['sellerPaymentStatus', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('payment_provider, payment_account_id')
        .eq('id', user.id)
        .single()
      
      if (error) throw error
      
      return {
        hasPaymentAccount: !!(data.payment_provider && data.payment_account_id),
      }
    },
    enabled: !!user?.id,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('myProducts')}</h1>
        <div className="flex gap-2">
          <Link href={sellerPaymentStatus?.hasPaymentAccount || isDirectSeller ? "/seller/products/create" : "/seller/payment-accounts"}>
            <Button 
              disabled={
                (productLimitInfo ? productLimitInfo.remaining <= 0 && !productLimitInfo.isDirectSeller : false) || 
                (!sellerPaymentStatus?.hasPaymentAccount && !isDirectSeller)
              }
              title={!sellerPaymentStatus?.hasPaymentAccount && !isDirectSeller ? t('paymentAccountRequired') : undefined}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('createProduct')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Growth/Scale 档位批量导入导出 */}
      {subscriptionTier >= 50 && (
        <BulkImportExport userId={user.id} subscriptionTier={subscriptionTier} />
      )}

      {/* 3档纯净模式: 商品数量限制进度条 */}
      {productLimitInfo && !productLimitInfo.isDirectSeller && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {t('productLimitProgress')}
            </span>
            <span className="text-sm text-muted-foreground">
              {productLimitInfo.currentCount} / {productLimitInfo.productLimit}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div 
              className={`h-2.5 rounded-full ${
                productLimitInfo.currentCount >= productLimitInfo.productLimit 
                  ? 'bg-destructive' 
                  : productLimitInfo.currentCount >= productLimitInfo.productLimit * 0.8 
                    ? 'bg-yellow-500' 
                    : 'bg-primary'
              }`}
              style={{ 
                width: `${Math.min((productLimitInfo.currentCount / productLimitInfo.productLimit) * 100, 100)}%` 
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {productLimitInfo.remaining > 0 
              ? t('remainingProducts', { count: productLimitInfo.remaining })
              : t('productLimitReached')
            }
          </p>
        </Card>
      )}

      {!products || products.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="mb-4 text-muted-foreground">{tCommon('noData')}</p>
          <Link href="/seller/products/create">
            <Button>{t('createProduct')}</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product: any) => {
            const displayName = getDisplayContent(
              locale,
              product.content_lang ?? null,
              product.name,
              product.name_translated
            )
            const displayDescription = getDisplayContent(
              locale,
              product.content_lang ?? null,
              product.description,
              product.description_translated
            )
            return (
              <Card key={product.id} className="p-4">
                {product.images?.[0] && (
                  <img
                    src={product.images[0]}
                    alt={displayName}
                    className="mb-3 h-48 w-full rounded object-cover"
                    onError={handleImageError}
                  />
                )}
                <h3 className="mb-2 font-semibold">{displayName}</h3>
                <p className="mb-2 text-sm text-muted-foreground line-clamp-2">
                  {displayDescription}
                </p>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-lg font-bold">{formatCurrency(product.price, (product.currency as Currency) || 'USD')}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      product.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : product.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {product.status === 'active'
                      ? tCommon('active')
                      : product.status === 'pending'
                      ? tCommon('pending')
                      : tCommon('inactive')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/seller/products/${product.id}/edit`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Edit className="mr-2 h-4 w-4" />
                      {tCommon('edit')}
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(product.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
            </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
