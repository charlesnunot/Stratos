'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { useCartStore } from '@/store/cartStore'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, Copy } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { AddressSelector } from '@/components/ecommerce/AddressSelector'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { getDisplayContent } from '@/lib/ai/display-translated'
import { criticalFetch, CriticalPathTimeoutError } from '@/lib/critical-path/critical-fetch'

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as any)?.name ?? ''
  const msg = String((err as any)?.message ?? '')
  return (
    name === 'AbortError' ||
    msg.includes('aborted') ||
    msg.includes('cancelled') ||
    msg.includes('signal is aborted')
  )
}

interface CreatedOrder {
  id: string
  order_number: string
  total_amount: number
  payment_method: string | null
  created_at: string
}

interface ProductMultiLangInfo {
  id: string
  name: string
  nameTranslated: string | null
  contentLang: 'zh' | 'en' | null
}

export default function CheckoutPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const { items, getSelectedItems, getSelectedTotal, removeItem, removeSelectedItems, addItem, selectAll } = useCartStore()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [createdOrders, setCreatedOrders] = useState<CreatedOrder[] | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<{
    id: string
    recipient_name: string
    phone: string
    country: string
    state: string | null
    city: string | null
    street_address: string
    postal_code: string | null
  } | null>(null)

  // No need for productMultiLangInfos state anymore
  // We'll use the multi-language information stored in cart items

  // Memoize address selection callback to prevent infinite re-renders
  const handleSelectAddress = useCallback((address: any) => {
    if (address) {
      setSelectedAddress({
        id: address.id,
        recipient_name: address.recipient_name,
        phone: address.phone,
        country: address.country,
        state: address.state,
        city: address.city,
        street_address: address.street_address,
        postal_code: address.postal_code,
      })
    } else {
      setSelectedAddress(null)
    }
  }, [])
  const PAYMENT_METHODS = ['stripe', 'paypal', 'alipay', 'wechat', 'bank'] as const
  type PaymentMethod = (typeof PAYMENT_METHODS)[number]
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethod[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false)
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null)
  const [productIdFromUrlHandled, setProductIdFromUrlHandled] = useState(false)
  const t = useTranslations('checkout')
  const tOrders = useTranslations('orders')
  const tPayments = useTranslations('payments')
  const tCommon = useTranslations('common')
  const tSupport = useTranslations('support')
  const locale = useLocale()

  // Detect user's local currency based on locale
  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])

  const selectedItems = getSelectedItems()
  const selectedTotal = getSelectedTotal()

  // Memoize display names for all items based on current locale
  const itemDisplayNames = useMemo(() => {
    const displayNames = new Map<string, string>()
    
    selectedItems.forEach((item) => {
      // Generate display name based on current locale and item's multi-language info
      const displayName = getDisplayContent(
        locale,
        item.contentLang || null,
        item.name,
        item.nameTranslated
      )
      
      displayNames.set(item.product_id, displayName)
    })
    
    return displayNames
  }, [selectedItems, locale])

  // Use useMemo to stabilize productIds reference
  // Create a stable string key from productIds to use as dependency
  const productIdsKey = useMemo(() => {
    return selectedItems.map(item => item.product_id).sort().join(',')
  }, [selectedItems.length, selectedItems.map(i => i.product_id).sort().join(',')])
  
  const productIds = useMemo(() => 
    selectedItems.map(item => item.product_id),
    [productIdsKey]
  )

  // No need to fetch product multi-language information anymore
  // We'll use the multi-language information stored in cart items

  // Handle direct checkout: cart empty + product_id in URL - fetch product and add to cart
  useEffect(() => {
    if (typeof window === 'undefined' || showConfirmation) return
    if (items.length > 0 || selectedItems.length > 0) return
    const urlParams = new URLSearchParams(window.location.search)
    const productId = urlParams.get('product_id')
    if (!productId || productIdFromUrlHandled) return

    let cancelled = false
    ;(async () => {
      try {
        const { data: resp } = await criticalFetch<{ ok?: boolean; product?: any }>(
          'checkout_validate_product',
          '/api/checkout/validate-product',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ productId }),
            timeoutMs: 8000,
          }
        )
        if (cancelled) return
        setProductIdFromUrlHandled(true)
        if (!resp?.ok || !resp?.product) {
          toast({ variant: 'destructive', title: t('validationFailed'), description: t('pleaseAddToCartFirst') })
          router.push(`/product/${productId}`)
          return
        }
        const p = resp.product
        if (!p?.id || p.price == null) {
          toast({ variant: 'destructive', title: t('validationFailed'), description: t('pleaseAddToCartFirst') })
          router.push(`/product/${productId}`)
          return
        }
        addItem({
          product_id: p.id,
          quantity: 1,
          price: p.price,
          name: p.name ?? '',
          image: p.image ?? '',
          currency: p.currency ?? 'CNY',
        })
        selectAll()
      } catch (err) {
        if (cancelled) return
        setProductIdFromUrlHandled(true)
        const isTimeout = err instanceof CriticalPathTimeoutError
        toast({
          variant: 'destructive',
          title: isTimeout ? t('validationTimeoutRetry') : t('validationFailed'),
          description: isTimeout ? undefined : t('pleaseAddToCartFirst'),
        })
        if (!isTimeout) router.push('/cart')
      }
    })()
    return () => { cancelled = true }
  }, [showConfirmation, items.length, selectedItems.length, productIdFromUrlHandled, addItem, selectAll, router, toast, t])

  // Fetch available payment methods for all sellers in cart
  useEffect(() => {
    const fetchAvailablePaymentMethods = async () => {
      if (selectedItems.length === 0) {
        setAvailablePaymentMethods([])
        setLoadingPaymentMethods(false)
        setPaymentMethodsError(null)
        return
      }

      setLoadingPaymentMethods(true)
      setPaymentMethodsError(null)
      try {
        const { data } = await criticalFetch<{ availableMethods?: string[] }>(
          'checkout_get_payment_methods',
          '/api/orders/get-available-payment-methods',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds }),
            timeoutMs: 8000,
          }
        )
        const methods = (data?.availableMethods || []).filter(
          (m): m is PaymentMethod => PAYMENT_METHODS.includes(m as PaymentMethod)
        )
        setAvailablePaymentMethods(methods)

        if (methods.length && !selectedPaymentMethod) {
          setSelectedPaymentMethod(methods[0])
        }
      } catch (error: unknown) {
        const isTimeout = error instanceof CriticalPathTimeoutError
        setPaymentMethodsError(isTimeout ? t('validationTimeoutRetry') : t('paymentMethodsLoadFailed'))
        setAvailablePaymentMethods([])
      } finally {
        setLoadingPaymentMethods(false)
      }
    }

    fetchAvailablePaymentMethods()
  }, [productIdsKey]) // 使用稳定的 productIdsKey 作为依赖项

  // 等待认证状态加载
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 认证加载完成后检查用户
  if (!user) {
    router.push('/login')
    return null
  }

  // Handle direct checkout from product page
  // This is now handled in the useProductCardActions buyNow method
  // We'll keep this check to ensure cart is not empty
  if (!showConfirmation && (items.length === 0 || selectedItems.length === 0)) {
    // Check if we're in the browser
    if (typeof window !== 'undefined') {
      // Check if there's a product_id in URL params
      const urlParams = new URLSearchParams(window.location.search)
      const productId = urlParams.get('product_id')
      
      if (productId) {
        // Show loading while we handle the direct checkout
        return (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )
      }
    }
    
    // If cart is empty and no product_id in URL params, redirect to cart
    router.push('/cart')
    return null
  }

  const handleCheckout = async () => {
    setLoading(true)
    try {
      // Get complete product details for validation
      const productIds = selectedItems.map((item) => item.product_id)
      let query = supabase
        .from('products')
        .select('id, seller_id, stock, status, price, name')

      if (productIds.length === 1) {
        query = query.eq('id', productIds[0])
      } else if (productIds.length > 1) {
        query = query.in('id', productIds)
      } else {
        toast({
          variant: 'destructive',
          title: t('cartEmpty'),
          description: t('cartEmptyDescription'),
        })
        router.push('/cart')
        return
      }

      const { data: products, error: productsError } = await query

      if (productsError) {
        toast({
          variant: 'destructive',
          title: t('validationFailed'),
          description: t('validationFailedDescription'),
        })
        return
      }

      if (!products || products.length === 0) {
        toast({
          variant: 'destructive',
          title: t('cartEmpty'),
          description: t('cartEmptyDescription'),
        })
        router.push('/cart')
        return
      }

      // 如果产品数量不匹配，说明某些产品不存在，需要移除它们
      if (products.length !== productIds.length) {
        const foundProductIds = new Set(products.map((p) => p.id))
        const missingItems = selectedItems.filter((item) => !foundProductIds.has(item.product_id))

        // 移除不存在的商品
        missingItems.forEach(({ product_id }) => {
          removeItem(product_id)
        })

        toast({
          variant: 'warning',
          title: t('partialItemsRemoved'),
          description: t('partialItemsRemovedDescription', { count: missingItems.length }),
          duration: 3000,
        })

        // 如果所有商品都被移除，停止处理
        if (products.length === 0) {
          router.push('/cart')
          return
        }
      }

      // Create a map for quick product lookup
      const productMap = new Map(products.map((p) => [p.id, p]))

      // Validate all items before proceeding
      const validItems: typeof selectedItems = []
      const invalidItems: Array<{ item: typeof selectedItems[0]; reason: string }> = []

      for (const item of selectedItems) {
        const product = productMap.get(item.product_id)
        
        if (!product) {
          invalidItems.push({ item, reason: t('productNotFound') })
          continue
        }

        if (product.status !== 'active') {
          invalidItems.push({ item, reason: t('productInactiveReason', { status: product.status }) })
          continue
        }

        if (product.stock != null && product.stock < item.quantity) {
          invalidItems.push({ item, reason: t('stockInsufficientReason', { available: product.stock, required: item.quantity }) })
          continue
        }

        // Verify price matches (allow small floating point differences)
        const priceDiff = Math.abs(product.price - item.price)
        if (priceDiff > 0.01) {
          invalidItems.push({ item, reason: t('priceChangedReason', { current: product.price.toFixed(2), cart: item.price.toFixed(2) }) })
          continue
        }

        validItems.push(item)
      }

      // If there are invalid items, show error and remove them from cart
      if (invalidItems.length > 0) {
        invalidItems.forEach(({ item }) => {
          removeItem(item.product_id)
        })

        const errorMessages = invalidItems.map(
          ({ item, reason }) => `${item.name}: ${reason}`
        ).join('\n')

        toast({
          variant: 'destructive',
          title: t('partialItemsInvalid'),
          description: t('partialItemsInvalidDescription', { count: invalidItems.length, details: errorMessages }),
          duration: 5000,
        })

        // If no valid items remain, stop
        if (validItems.length === 0) {
          return
        }
      }

      // Validate shipping address before creating order
      if (!selectedAddress) {
        toast({
          variant: 'destructive',
          title: t('selectAddressRequired'),
          description: t('selectAddressDescription'),
          duration: 5000,
        })
        setLoading(false)
        return
      }

      // Prepare items for API call
      const apiItems = validItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
      }))

      // Validate payment method selection
      if (!selectedPaymentMethod) {
        toast({
          variant: 'destructive',
          title: t('selectPaymentRequired'),
          description: t('selectPaymentDescription'),
          duration: 5000,
        })
        setLoading(false)
        return
      }

      let result: any
      try {
        const { data: orderData } = await criticalFetch<{ orders?: any[]; order_group_id?: string; error?: string; requiresDeposit?: boolean; details?: any[] }>(
          'checkout_create_orders',
          '/api/orders/create',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: apiItems,
              currency: 'CNY',
              payment_method: selectedPaymentMethod,
              shipping_address_id: selectedAddress.id,
              shipping_address: {
                recipientName: selectedAddress.recipient_name,
                phone: selectedAddress.phone,
                country: selectedAddress.country,
                state: selectedAddress.state || '',
                city: selectedAddress.city || '',
                address: selectedAddress.street_address,
                streetAddress: selectedAddress.street_address,
                postalCode: selectedAddress.postal_code || '',
              },
            }),
            timeoutMs: 8000,
          }
        )
        result = orderData
      } catch (err) {
        if (err instanceof CriticalPathTimeoutError) {
          toast({
            variant: 'destructive',
            title: t('validationTimeoutRetry'),
            duration: 5000,
          })
          setLoading(false)
          return
        }
        throw err
      }

      if (result.requiresDeposit) {
        toast({
          variant: 'destructive',
          title: '生成订单失败',
          description: '生成订单失败，请联系卖家',
          duration: 5000,
        })
        setLoading(false)
        return
      }
      if (result.details && Array.isArray(result.details)) {
        toast({
          variant: 'destructive',
          title: '订单创建失败',
          description: result.details.join('\n'),
          duration: 5000,
        })
        setLoading(false)
        return
      }
      if (!result.orders?.length) {
        toast({
          variant: 'destructive',
          title: result?.error ? t('productsNotFound') : t('serverError'),
          description: result?.error || t('serverErrorDescription'),
          duration: 5000,
        })
        setLoading(false)
        return
      }

      const { orders, warnings } = result

      if (!orders || orders.length === 0) {
        throw new Error('No orders were created')
      }

      // Show success message
      if (orders.length > 1) {
        toast({
          variant: 'default',
          title: t('orderCreated'),
          description: t('orderCreateSuccessMultiple', { count: orders.length }),
        })
      } else {
        toast({
          variant: 'default',
          title: t('orderCreated'),
        })
      }

      // Show warnings if any
      if (warnings && warnings.length > 0) {
        console.warn('Order creation warnings:', warnings)
      }

      // Store created orders and show confirmation
      setCreatedOrders(orders)
      setShowConfirmation(true)

      // 订单创建成功后，仅移除本次选中的商品
      removeSelectedItems()
    } catch (error: unknown) {
      if (isAbortError(error)) {
        toast({
          variant: 'default',
          title: tCommon('cancel') || '已取消',
          description: t('requestCancelledRetry'),
        })
        return
      }
      if (error instanceof CriticalPathTimeoutError) {
        toast({
          variant: 'destructive',
          title: t('validationTimeoutRetry'),
        })
        return
      }
      console.error('Checkout error:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: (error as Error)?.message || tOrders('orderCreateFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  // Copy order number to clipboard
  const copyOrderNumber = (orderNumber: string) => {
    navigator.clipboard.writeText(orderNumber)
    toast({
      variant: 'default',
      title: t('orderNumberCopied') || '订单号已复制',
    })
  }

  // If showing confirmation, render confirmation view
  if (showConfirmation && createdOrders && createdOrders.length > 0) {
    const firstOrder = createdOrders[0]
    const totalAmount = createdOrders.reduce((sum, order) => sum + order.total_amount, 0)

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('orderCreated') || '订单创建成功'}</h1>
            <p className="text-sm text-muted-foreground">{t('orderCreatedDescription') || '请确认订单信息无误后前往支付'}</p>
          </div>
        </div>

        {/* Order Information */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('orderInformation') || '订单信息'}</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('orderNumber') || '订单号'}:</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{firstOrder.order_number}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyOrderNumber(firstOrder.order_number)}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('orderStatus') || '订单状态'}:</span>
              <span className="font-semibold text-yellow-600">{tOrders('pending') || '待支付'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('createdAt') || '创建时间'}:</span>
              <span className="font-semibold">
                {new Date(firstOrder.created_at).toLocaleString('zh-CN')}
              </span>
            </div>
            {createdOrders.length > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('orderCount') || '订单数量'}:</span>
                <span className="font-semibold">{createdOrders.length} {t('orders') || '个订单'}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Order Items */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('orderDetails')}</h2>
          <div className="space-y-3">
            {selectedItems.map((item) => {
              // Get display name from memoized map
              const displayName = itemDisplayNames.get(item.product_id) || item.name
              
              return (
                <div key={item.product_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.image}
                      alt={displayName}
                      className="h-12 w-12 rounded object-cover"
                    />
                    <div>
                      <p className="font-medium">{displayName}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('quantity')}: {item.quantity} × {formatPriceWithConversion(item.price, (item.currency || 'CNY') as Currency, userCurrency).main}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold">
                    {formatPriceWithConversion(item.price * item.quantity, (item.currency || 'CNY') as Currency, userCurrency).main}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{tOrders('totalAmount')}</span>
              <span className="text-xl font-bold">{formatPriceWithConversion(totalAmount, 'CNY', userCurrency).main}</span>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/cart')} className="flex-1">
            {t('backToCart') || '返回购物车'}
          </Button>
          <Button
            onClick={() => router.push(`/orders/${firstOrder.id}/pay`)}
            className="flex-1"
          >
            {t('goToPayment') || '前往支付'}
          </Button>
        </div>
        {createdOrders.length > 1 && (
          <div className="text-center">
            <Link href="/orders" className="text-sm text-muted-foreground hover:underline">
              {t('viewAllOrders') || '查看所有订单'}
            </Link>
          </div>
        )}
      </div>
    )
  }

  // Default checkout view
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>

      {/* Order Items */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('orderDetails')}</h2>
        <div className="space-y-3">
          {selectedItems.map((item) => {
              // Get display name from memoized map
              const displayName = itemDisplayNames.get(item.product_id) || item.name
              
              return (
                <div key={item.product_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.image}
                      alt={displayName}
                      className="h-12 w-12 rounded object-cover"
                    />
                    <div>
                      <p className="font-medium">{displayName}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('quantity')}: {item.quantity} × {formatPriceWithConversion(item.price, (item.currency || 'CNY') as Currency, userCurrency).main}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold">
                    {formatPriceWithConversion(item.price * item.quantity, (item.currency || 'CNY') as Currency, userCurrency).main}
                  </p>
                </div>
              )
            })}
        </div>
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">{tOrders('totalAmount')}</span>
            <span className="text-xl font-bold">{formatPriceWithConversion(selectedTotal, 'CNY', userCurrency).main}</span>
          </div>
        </div>
      </Card>

      {/* Shipping Address Selector */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('shippingAddress') || '收货信息'}</h2>
        <AddressSelector
          selectedAddressId={selectedAddress?.id || null}
          onSelectAddress={handleSelectAddress}
          showAddButton={true}
        />
      </Card>

      {/* Payment Method Selector */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{tPayments('paymentMethod') || '支付方式'}</h2>
        {paymentMethodsError && (
          <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{paymentMethodsError}</p>
          </div>
        )}
        {loadingPaymentMethods ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">{t('loadingPaymentMethods')}</span>
          </div>
        ) : availablePaymentMethods.length === 0 && !paymentMethodsError ? (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-3">
            <p className="text-sm text-destructive">
              {t('noPaymentMethodsForSellers')}
            </p>
            <Link href="/support/tickets/create" className="inline-block">
              <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10">
                {tSupport('contactSupport')}
              </Button>
            </Link>
          </div>
        ) : availablePaymentMethods.length > 0 ? (
          <PaymentMethodSelector
            selectedMethod={selectedPaymentMethod}
            onSelect={setSelectedPaymentMethod}
            availableMethods={availablePaymentMethods}
          />
        ) : null}
        {availablePaymentMethods.length > 0 && availablePaymentMethods.length < 5 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('paymentMethodsIntersectionHint')}
          </p>
        )}
      </Card>

      {/* Checkout Button */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()} disabled={loading}>
          {tCommon('back')}
        </Button>
        <Button onClick={handleCheckout} disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {tCommon('loading')}
            </>
          ) : (
            t('confirmOrder')
          )}
        </Button>
      </div>
    </div>
  )
}
