'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { usePaymentAccount, PayoutEligibility } from '@/lib/hooks/usePaymentAccount'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, DollarSign, ShoppingBag, X, Eye, BarChart3, CreditCard } from 'lucide-react'
import { PaymentAccountBanner } from '@/components/payment/PaymentAccountBanner'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useToast } from '@/lib/hooks/useToast'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ProductPromotion {
  productId: string
  postCount: number
  totalEarnings: number
  totalOrders: number
  posts: {
    postId: string
    status: string
    createdAt: string
    earnings: number
    orders: number
  }[]
}

export function AffiliateCenter() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('affiliate')
  const locale = useLocale()
  const userCurrency = detectCurrency({ browserLocale: locale })
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  
  // 检查收款账户状态
  const { data: paymentAccount, isLoading: paymentAccountLoading } = usePaymentAccount(user?.id)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  // Get all affiliate products with promotion data
  const { data: productsWithPromotions, isLoading } = useQuery({
    queryKey: ['affiliateProductsWithPromotions', user?.id],
    queryFn: async () => {
      // Get all affiliate-enabled products
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          seller:profiles!products_seller_id_fkey(username, display_name),
          affiliate_products(commission_rate)
        `)
        .eq('allow_affiliate', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (productsError) throw productsError

      // If user is logged in, get their promotion data for these products
      let promotionMap: Map<string, ProductPromotion> = new Map()
      
      if (user && products && products.length > 0) {
        // Get affiliate posts for this user
        const { data: affiliatePosts, error: postsError } = await supabase
          .from('affiliate_posts')
          .select('product_id, post_id, created_at')
          .eq('affiliate_id', user.id)
          .in('product_id', products.map(p => p.id))

        if (postsError) {
          console.error('Error fetching affiliate posts:', postsError)
        } else if (affiliatePosts && affiliatePosts.length > 0) {
          // Get post statuses separately
          const postIds = affiliatePosts.map(ap => ap.post_id)
          const { data: postsData, error: postsStatusError } = await supabase
            .from('posts')
            .select('id, status')
            .in('id', postIds)

          if (postsStatusError) {
            console.error('Error fetching posts:', postsStatusError)
          }

          const postStatusMap = new Map(postsData?.map(p => [p.id, p.status]) || [])

          // Get orders that came from these affiliate posts
          let commissions: any[] = []
          if (postIds.length > 0) {
            // First get orders that came from these posts
            const { data: ordersData } = await supabase
              .from('orders')
              .select('id, affiliate_post_id')
              .eq('affiliate_id', user.id)
              .in('affiliate_post_id', postIds)

            const orderIds = ordersData?.map(o => o.id) || []
            const orderToPostMap = new Map(ordersData?.map(o => [o.id, o.affiliate_post_id]) || [])

            // Then get commissions for these orders
            if (orderIds.length > 0) {
              const { data: commissionsData, error: commissionsError } = await supabase
                .from('affiliate_commissions')
                .select('order_id, amount, status')
                .eq('affiliate_id', user.id)
                .in('order_id', orderIds)

              if (commissionsError) {
                console.error('Error fetching commissions:', commissionsError)
              } else {
                // Map commissions to posts via orders
                commissions = (commissionsData || []).map(c => ({
                  ...c,
                  post_id: orderToPostMap.get(c.order_id)
                }))
              }
            }
          }

          // Build promotion map
          affiliatePosts.forEach((ap: any) => {
            const productId = ap.product_id
            const postCommissions = commissions?.filter((c: any) => c.post_id === ap.post_id) || []
            const postEarnings = postCommissions
              .filter((c: any) => c.status === 'paid')
              .reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
            const postOrders = postCommissions.length

            if (!promotionMap.has(productId)) {
              promotionMap.set(productId, {
                productId,
                postCount: 0,
                totalEarnings: 0,
                totalOrders: 0,
                posts: []
              })
            }

            const promo = promotionMap.get(productId)!
            promo.postCount++
            promo.totalEarnings += postEarnings
            promo.totalOrders += postOrders
            promo.posts.push({
              postId: ap.post_id,
              status: postStatusMap.get(ap.post_id) || 'unknown',
              createdAt: ap.created_at,
              earnings: postEarnings,
              orders: postOrders
            })
          })
        }
      }

      return {
        products: products || [],
        promotions: promotionMap
      }
    },
    enabled: true,
  })

  // Get affiliate stats
  const { data: stats } = useQuery({
    queryKey: ['affiliateStats', user?.id],
    queryFn: async () => {
      if (!user) return null

      const [earningsResult, ordersResult] = await Promise.all([
        supabase
          .from('affiliate_commissions')
          .select('amount')
          .eq('affiliate_id', user.id)
          .eq('status', 'paid'),
        supabase
          .from('affiliate_commissions')
          .select('*', { count: 'exact', head: true })
          .eq('affiliate_id', user.id),
      ])

      if (earningsResult.error) throw earningsResult.error
      if (ordersResult.error) throw ordersResult.error

      const totalEarnings = earningsResult.data?.reduce(
        (sum, commission) => sum + (commission.amount || 0),
        0
      ) || 0

      return {
        totalEarnings,
        totalOrders: ordersResult.count || 0,
      }
    },
    enabled: !!user,
  })

  // Cancel promotion mutation
  const cancelPromotionMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!user) throw new Error('Not authenticated')

      // Get all affiliate posts for this product
      const { data: affiliatePosts, error: fetchError } = await supabase
        .from('affiliate_posts')
        .select('post_id')
        .eq('affiliate_id', user.id)
        .eq('product_id', productId)

      if (fetchError) throw fetchError

      // Delete affiliate_posts records
      const { error: deleteError } = await supabase
        .from('affiliate_posts')
        .delete()
        .eq('affiliate_id', user.id)
        .eq('product_id', productId)

      if (deleteError) throw deleteError

      // Delete associated posts
      const postIds = affiliatePosts?.map(ap => ap.post_id) || []
      if (postIds.length > 0) {
        const { error: postsDeleteError } = await supabase
          .from('posts')
          .delete()
          .in('id', postIds)

        if (postsDeleteError) throw postsDeleteError
      }

      return { success: true }
    },
    onSuccess: () => {
      toast({
        variant: 'success',
        title: t('promotionCancelled') || '推广已取消',
        description: t('promotionCancelledDesc') || '您已成功取消该商品的推广',
      })
      queryClient.invalidateQueries({ queryKey: ['affiliateProductsWithPromotions'] })
      setCancelDialogOpen(false)
      setSelectedProductId(null)
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: t('cancelFailed') || '取消失败',
        description: error.message || '取消推广时出错，请重试',
      })
    },
  })

  const handleCancelClick = (productId: string) => {
    setSelectedProductId(productId)
    setCancelDialogOpen(true)
  }

  const confirmCancel = () => {
    if (selectedProductId) {
      cancelPromotionMutation.mutate(selectedProductId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { products = [], promotions = new Map() } = productsWithPromotions || {}

  // Separate promoted and unpromoted products
  const promotedProducts = products.filter((p: any) => promotions.has(p.id))
  const unpromotedProducts = products.filter((p: any) => !promotions.has(p.id))



  return (
    <div className="space-y-6">
      <PaymentAccountBanner 
        status={paymentAccount}
        isLoading={paymentAccountLoading}
        namespace="affiliate"
        showWhenBound={true}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('affiliateCenter')}</h1>
        <div className="flex gap-2">
          <Link href="/seller/payment-accounts">
            <Button variant="outline">
              <CreditCard className="mr-2 h-4 w-4" />
              {t('managePaymentAccount')}
            </Button>
          </Link>
          {user && (
            <Link href="/affiliate/stats">
              <Button variant="outline">
                <TrendingUp className="mr-2 h-4 w-4" />
                {t('viewEarnings')}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('totalEarnings')}</p>
                <p className="text-2xl font-bold">
                  {formatPriceWithConversion(stats.totalEarnings, 'USD', userCurrency).main}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('promotedOrders')}</p>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              </div>
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
        </div>
      )}

      {/* My Promoted Products Section */}
      {promotedProducts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {t('myPromotions') || '我的推广'}
            <Badge variant="secondary">{promotedProducts.length}</Badge>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {promotedProducts.map((product: any) => {
              const promotion = promotions.get(product.id)!
              const commissionRate =
                product.affiliate_products?.[0]?.commission_rate ||
                product.commission_rate ||
                0

              return (
                <div key={product.id} className="relative group">
                  <Link 
                    href={`/product/${product.id}`} 
                    className="absolute inset-0 z-10 pointer-events-none"
                    aria-label={getDisplayContent(locale, product.content_lang, product.name, product.name_translated)}
                  />
                  <Card 
                    role="link"
                    tabIndex={0}
                    className="overflow-hidden border-primary/20 hover:shadow-lg transition-shadow cursor-pointer relative pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('[data-no-nav]')) {
                        return;
                      }
                      router.push(`/product/${product.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/product/${product.id}`);
                      }
                    }}
                  >
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0]}
                          alt={getDisplayContent(locale, product.content_lang, product.name, product.name_translated)}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                          No Image
                        </div>
                      )}
                      <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground">
                        {t('promoted') || '已推广'}
                      </Badge>
                    </div>
                    <div className="p-4 border-t space-y-3">
                      <h3 className="font-semibold line-clamp-2">
                        {getDisplayContent(locale, product.content_lang, product.name, product.name_translated)}
                      </h3>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('price') || 'Price'}
                        </span>
                        <span className="font-bold text-lg">
                          {formatPriceWithConversion(product.price, (product.currency as Currency) || 'USD', userCurrency).main}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('commissionRate')}
                        </span>
                        <span className="font-semibold text-primary">
                          {commissionRate}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-muted rounded-lg p-2 text-center">
                          <p className="text-muted-foreground text-xs">{t('promotionCount') || '推广次数'}</p>
                          <p className="font-semibold">{promotion.postCount}</p>
                        </div>
                        <div className="bg-muted rounded-lg p-2 text-center">
                          <p className="text-muted-foreground text-xs">{t('earnings') || '收益'}</p>
                          <p className="font-semibold text-green-600">
                            {formatPriceWithConversion(promotion.totalEarnings, 'USD', userCurrency).main}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          data-no-nav
                        variant="outline" 
                        size="sm" 
                        className="w-full flex-1 relative z-20"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/post/create?product_id=${product.id}`);
                        }}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {t('promoteAgain') || '再次推广'}
                      </Button>
                        <Button
                          data-no-nav
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 relative z-20"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelClick(product.id);
                          }}
                          disabled={cancelPromotionMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available Products Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          {t('availableProducts') || '可推广商品'}
          <Badge variant="secondary">{unpromotedProducts.length}</Badge>
        </h2>
        {unpromotedProducts.length === 0 ? (
          <Card className="p-12 text-center">
            <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">{t('noMoreProducts') || '暂无更多可推广商品'}</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {unpromotedProducts.map((product: any) => {
              const commissionRate =
                product.affiliate_products?.[0]?.commission_rate ||
                product.commission_rate ||
                0

              return (
                <div key={product.id} className="relative group">
                  <Link 
                    href={`/product/${product.id}`} 
                    className="absolute inset-0 z-10 pointer-events-none"
                    aria-label={getDisplayContent(locale, product.content_lang, product.name, product.name_translated)}
                  />
                  <Card 
                    role="link"
                    tabIndex={0}
                    className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer relative pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('[data-no-nav]')) {
                        return;
                      }
                      router.push(`/product/${product.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/product/${product.id}`);
                      }
                    }}
                  >
                    <div className="aspect-square overflow-hidden bg-muted relative">
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0]}
                          alt={getDisplayContent(locale, product.content_lang, product.name, product.name_translated)}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                          No Image
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2">
                        <Badge variant="secondary">
                          {product.seller?.display_name || product.seller?.username || 'Unknown'}
                        </Badge>
                      </div>
                    </div>
                    <div className="p-4 border-t">
                      <h3 className="font-semibold line-clamp-2 mb-2">
                        {getDisplayContent(locale, product.content_lang, product.name, product.name_translated)}
                      </h3>

                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('price') || 'Price'}
                        </span>
                        <span className="font-bold text-lg">
                          {formatPriceWithConversion(product.price, (product.currency as Currency) || 'USD', userCurrency).main}
                        </span>
                      </div>

                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t('commissionRate')}
                        </span>
                        <span className="font-semibold text-primary">
                          {commissionRate}%
                        </span>
                      </div>
                      <Button 
                        data-no-nav
                        className="w-full relative z-20" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/post/create?product_id=${product.id}`);
                        }}
                      >
                        {t('createAffiliatePost')}
                      </Button>
                    </div>
                  </Card>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmCancelPromotion') || '确认取消推广'}</DialogTitle>
            <DialogDescription>
              {t('cancelPromotionWarning') || '取消推广将删除所有相关的推广帖子，此操作不可恢复。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              {t('keepPromotion') || '保留推广'}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={cancelPromotionMutation.isPending}
            >
              {cancelPromotionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('confirmCancel') || '确认取消'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
