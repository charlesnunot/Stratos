'use client'

import { useState, useEffect, useMemo } from 'react'

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
import { getDisplayContent, type ContentLang } from '@/lib/ai/display-translated'
import { getLocalizedColorName } from '@/lib/constants/colors'
import { getLocalizedSizeName } from '@/lib/constants/sizes'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { convertCurrency } from '@/lib/currency/convert-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'

interface CreatedOrder {
  id: string
  order_number: string
  total_amount: number
  payment_method: string | null
  created_at: string
}

interface ProductInfo {
  id: string
  seller_id: string
  price: number
  shipping_fee: number | null
  currency: string
  name: string | null
  name_translated: string | null
  content_lang: string | null
  stock?: number | null
  status?: string | null
}

export default function CheckoutPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const { items, getSelectedItems, getSelectedTotal, removeItem, removeSelectedItems } = useCartStore()
  const supabase = createClient()
  const locale = useLocale()
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
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<('stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank')[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank' | null>(null)
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false)
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductInfo[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const t = useTranslations('checkout')
  const tOrders = useTranslations('orders')
  const tPayments = useTranslations('payments')
  const tCommon = useTranslations('common')
  const tSupport = useTranslations('support')
  
  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])

  const selectedItems = getSelectedItems()
  const selectedTotal = getSelectedTotal()

  // 🔒 进入 Checkout 页面时，锁定归因
  useEffect(() => {
    const lockAttribution = async () => {
      try {
        const res = await fetch('/api/affiliate/checkout-lock', {
          method: 'POST',
          credentials: 'include'
        })
        const data = await res.json()
        if (data.locked) {
          console.log('[Checkout] Attribution locked successfully')
        }
      } catch (err) {
        // 静默失败，不影响 checkout 流程
        console.warn('[Checkout] Failed to lock attribution:', err)
      }
    }
    
    // 只在页面首次加载时执行一次
    lockAttribution()
  }, [])

  // Use useMemo to stabilize productIds reference
  // Create a stable string key from productIds to use as dependency
  const productIdsKey = useMemo(() => {
    return selectedItems.map(item => item.product_id).sort().join(',')
  }, [selectedItems.length, selectedItems.map(i => i.product_id).sort().join(',')])
  
  const productIds = useMemo(() => 
    selectedItems.map(item => item.product_id),
    [productIdsKey]
  )

  // Fetch products for shipping fee calculation
  useEffect(() => {
    const fetchProducts = async () => {
      if (selectedItems.length === 0) {
        setProducts([])
        setLoadingProducts(false)
        return
      }

      setLoadingProducts(true)
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

        let query = supabase
          .from('products')
          .select('id, seller_id, price, shipping_fee, currency, name, name_translated, content_lang')

        if (productIds.length === 1) {
          query = query.eq('id', productIds[0])
        } else if (productIds.length > 1) {
          query = query.in('id', productIds)
        }

        const { data, error } = await query

        clearTimeout(timeoutId)

        if (error) {
          console.error('Failed to fetch products:', error)
          setProducts([])
        } else {
          setProducts(data || [])
        }
      } catch (error) {
        console.error('Error fetching products:', error)
        setProducts([])
      } finally {
        setLoadingProducts(false)
      }
    }

    fetchProducts()
  }, [productIdsKey])

  // Create product map for quick lookup
  const productMap = useMemo(() => {
    return new Map(products.map((p) => [p.id, p]))
  }, [products])

  // Helper function to get localized content
  const getLocalizedContent = (
    content: string | null | undefined,
    contentTranslated: string | null | undefined,
    contentLang: string | null | undefined
  ): string => {
    return getDisplayContent(
      locale,
      (contentLang === 'zh' || contentLang === 'en' ? contentLang : null) as ContentLang,
      content,
      contentTranslated
    )
  }

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
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

        const response = await fetch('/api/orders/get-available-payment-methods', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productIds }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error('Failed to fetch available payment methods:', errorData)
          setAvailablePaymentMethods([])
          setPaymentMethodsError('加载支付方式失败，请刷新页面重试')
          return
        }

        const data = await response.json()
        setAvailablePaymentMethods(data.availableMethods || [])

        // Auto-select first available method
        if (data.availableMethods && data.availableMethods.length > 0 && !selectedPaymentMethod) {
          setSelectedPaymentMethod(data.availableMethods[0])
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error('Request timeout while fetching payment methods')
          setPaymentMethodsError('请求超时，请刷新页面重试')
        } else {
          console.error('Error fetching available payment methods:', error)
          setPaymentMethodsError('加载支付方式失败，请刷新页面重试')
        }
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

  // 只有在未显示确认页面时才检查购物车是否为空
  if (!showConfirmation && (items.length === 0 || selectedItems.length === 0)) {
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
        .select('id, seller_id, stock, status, price, shipping_fee, name, currency')

      if (productIds.length === 1) {
        query = query.eq('id', productIds[0])
      } else if (productIds.length > 1) {
        query = query.in('id', productIds)
      } else {
        toast({
          variant: 'destructive',
          title: '购物车为空',
          description: '购物车中没有有效商品',
        })
        router.push('/cart')
        return
      }

      const { data: products, error: productsError } = await query

      if (productsError) {
        toast({
          variant: 'destructive',
          title: '验证失败',
          description: '无法验证商品信息，请刷新后重试',
        })
        return
      }

      if (!products || products.length === 0) {
        toast({
          variant: 'destructive',
          title: '购物车为空',
          description: '购物车中没有有效商品',
        })
        router.push('/cart')
        return
      }

      // 如果产品数量不匹配，说明某些产品不存在，需要移除它们
      if (products.length !== productIds.length) {
        const foundProductIds = new Set(products.map((p) => p.id))
        const missingItems = selectedItems.filter((item) => !foundProductIds.has(item.product_id))

        // 移除不存在的商品
        missingItems.forEach(({ product_id, color, size }) => {
          removeItem(product_id, color, size)
        })

        toast({
          variant: 'warning',
          title: '部分商品已移除',
          description: `已移除 ${missingItems.length} 个不存在的商品`,
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
          invalidItems.push({ item, reason: '商品不存在' })
          continue
        }

        if (product.status !== 'active') {
          invalidItems.push({ item, reason: `商品已下架 (状态: ${product.status})` })
          continue
        }

        if (product.stock != null && product.stock < item.quantity) {
          invalidItems.push({ item, reason: `库存不足 (可用: ${product.stock}, 需要: ${item.quantity})` })
          continue
        }

        // Verify price matches (allow small floating point differences based on currency)
        const priceDiff = Math.abs(product.price - item.price)
        const productCurrency = product.currency?.toUpperCase() || 'CNY'
        const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(productCurrency)
        const precision = isZeroDecimalCurrency ? 0 : 0.01
        
        if (priceDiff > precision) {
          invalidItems.push({ item, reason: `价格已变化 (当前: ${formatPriceWithConversion(product.price, product.currency as Currency, userCurrency).main}, 购物车: ${formatPriceWithConversion(item.price, product.currency as Currency, userCurrency).main})` })
          continue
        }

        validItems.push(item)
      }

      // If there are invalid items, show error and remove them from cart
      if (invalidItems.length > 0) {
        invalidItems.forEach(({ item }) => {
          removeItem(item.product_id, item.color, item.size)
        })

        const errorMessages = invalidItems.map(
          ({ item, reason }) => `${item.name}: ${reason}`
        ).join('\n')

        toast({
          variant: 'destructive',
          title: '部分商品无法结算',
          description: `已移除 ${invalidItems.length} 个无效商品。\n${errorMessages}`,
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
          title: '请选择收货地址',
          description: '请选择一个收货地址或添加新地址',
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
        color: item.color ?? undefined,
        size: item.size ?? undefined,
      }))

      // Validate payment method selection
      if (!selectedPaymentMethod) {
        toast({
          variant: 'destructive',
          title: '请选择支付方式',
          description: '请选择一个可用的支付方式',
          duration: 5000,
        })
        setLoading(false)
        return
      }

      // Determine order currency: try to use user's preferred currency, fallback to product currency
      // Priority: user currency -> first product currency -> USD as last resort
      let orderCurrency: Currency = 'USD'; // Default fallback
      if (userCurrency) {
        orderCurrency = userCurrency;
      } else if (products && products.length > 0) {
        orderCurrency = (products[0].currency as Currency) || 'USD';
      }

      // Call the API to create orders
      const response = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: apiItems,
          currency: orderCurrency,
          payment_method: selectedPaymentMethod, // Pass selected payment method
          shipping_address_id: selectedAddress.id, // Pass address ID to use address from table
          shipping_address: {
            recipientName: selectedAddress.recipient_name,
            phone: selectedAddress.phone,
            country: selectedAddress.country,
            state: selectedAddress.state || '',
            city: selectedAddress.city || '',
            address: selectedAddress.street_address,  // 用于后端验证
            streetAddress: selectedAddress.street_address,  // 用于前端显示
            postalCode: selectedAddress.postal_code || '',
          },
        }),
      })

      let result
      try {
        result = await response.json()
      } catch (jsonError) {
        // 如果响应不是JSON，使用默认错误消息
        throw new Error(`订单创建失败: ${response.status === 404 ? '商品不存在' : '服务器错误'}`)
      }

      if (!response.ok) {
        // 如果是401错误，重定向到登录页
        if (response.status === 401) {
          toast({
            variant: 'destructive',
            title: '登录已过期',
            description: '请重新登录后继续',
          })
          router.push('/login')
          return
        }
        
        // 如果是404错误，显示商品不存在的错误
        if (response.status === 404) {
          const errorMessage = result?.error || '购物车中的某些商品已不存在，请刷新购物车后重试'
          toast({
            variant: 'destructive',
            title: '商品不存在',
            description: errorMessage,
            duration: 5000,
          })
          // 如果所有商品都不存在，清空购物车并跳转
          if (result?.error?.includes('All products not found') || result?.error?.includes('All products')) {
            router.push('/cart')
          }
          return
        }
        
        // 如果是500错误，显示服务器错误提示
        if (response.status === 500) {
          toast({
            variant: 'destructive',
            title: '服务器错误',
            description: result?.error || result?.details || '服务器暂时无法处理请求，请稍后重试',
            duration: 5000,
          })
          return
        }
        
        // Handle API errors
        if (result.requiresDeposit) {
          toast({
            variant: 'destructive',
            title: '生成订单失败',
            description: '生成订单失败，请联系卖家',
            duration: 5000,
          })
        } else if (result.details && Array.isArray(result.details)) {
          // Validation errors from API
          toast({
            variant: 'destructive',
            title: '订单创建失败',
            description: result.details.join('\n'),
            duration: 5000,
          })
        } else {
          throw new Error(result.error || 'Failed to create order')
        }
        return
      }

      // Orders created successfully
      const { orders, warnings } = result

      if (!orders || orders.length === 0) {
        throw new Error('No orders were created')
      }

      // Show success message
      if (orders.length > 1) {
        toast({
          variant: 'default',
          title: '订单创建成功',
          description: `已创建 ${orders.length} 个订单（按卖家分组）`,
        })
      } else {
        toast({
          variant: 'default',
          title: '订单创建成功',
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
    } catch (error: any) {
      if (isAbortError(error)) {
        toast({
          variant: 'default',
          title: tCommon('cancel') || '已取消',
          description: '请求已取消，请重试',
        })
        return
      }
      console.error('Checkout error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: error?.message || tOrders('orderCreateFailed'),
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t('orderDetails')}</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/cart">{t('editCart') || '返回购物车修改'}</Link>
            </Button>
          </div>
          <div className="space-y-3">
            {selectedItems.map((item) => {
              // Get the product from the fetched products to get content_lang and translated fields
              const product = productMap.get(item.product_id)
              const localizedProductName = product 
                ? getLocalizedContent(product.name, product.name_translated, product.content_lang)
                : item.name // fallback to stored name if product not found
              
              const localizedColor = item.color 
                ? getLocalizedColorName(item.color, locale) 
                : null
              const localizedSize = item.size
                ? getLocalizedSizeName(item.size, locale)
                : null

              return (
                <div key={`${item.product_id}-${item.color ?? ''}-${item.size ?? ''}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.image}
                      alt={localizedProductName}
                      className="h-12 w-12 rounded object-cover"
                    />
                    <div>
                      <p className="font-medium line-clamp-2">{localizedProductName}</p>
                      {(localizedColor || localizedSize) && (
                        <p className="text-xs text-muted-foreground">
                          {localizedColor && `${tCommon('color')}: ${localizedColor}`}
                          {localizedColor && localizedSize && ' | '}
                          {localizedSize && `${tCommon('size')}: ${localizedSize}`}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                      {t('quantity')}: {item.quantity} × {product ? formatPriceWithConversion(item.price, product.currency as Currency, userCurrency).main : formatPriceWithConversion(item.price, (item.currency || 'CNY') as Currency, userCurrency).main}
                    </p>
                    </div>
                  </div>
                  <p className="font-semibold">
                    {product ? formatPriceWithConversion(item.price * item.quantity, product.currency as Currency, userCurrency).main : formatPriceWithConversion(item.price * item.quantity, (item.currency || 'CNY') as Currency, userCurrency).main}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{tOrders('totalAmount')}</span>
              <span className="text-xl font-bold">{formatPriceWithConversion(totalAmount, 'CNY' as Currency, userCurrency).main}</span>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('orderDetails')}</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/cart">{t('editCart') || '返回购物车修改'}</Link>
          </Button>
        </div>
        <div className="space-y-3">
          {selectedItems.map((item) => {
            // Get the product from the fetched products to get content_lang and translated fields
            const product = productMap.get(item.product_id)
            const localizedProductName = product 
              ? getLocalizedContent(product.name, product.name_translated, product.content_lang)
              : item.name // fallback to stored name if product not found
            
            const localizedColor = item.color 
              ? getLocalizedColorName(item.color, locale) 
              : null
            const localizedSize = item.size
              ? getLocalizedSizeName(item.size, locale)
              : null

            return (
              <div key={`${item.product_id}-${item.color ?? ''}-${item.size ?? ''}`} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={item.image}
                    alt={localizedProductName}
                    className="h-12 w-12 rounded object-cover"
                  />
                  <div>
                    <p className="font-medium line-clamp-2">{localizedProductName}</p>
                    {(localizedColor || localizedSize) && (
                      <p className="text-xs text-muted-foreground">
                        {localizedColor && `${tCommon('color')}: ${localizedColor}`}
                        {localizedColor && localizedSize && ' | '}
                        {localizedSize && `${tCommon('size')}: ${localizedSize}`}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {t('quantity')}: {item.quantity} × {product ? formatPriceWithConversion(item.price, product.currency as Currency, userCurrency).main : formatPriceWithConversion(item.price, (item.currency || 'CNY') as Currency, userCurrency).main}
                    </p>
                  </div>
                </div>
                <p className="font-semibold">
                  {product ? formatPriceWithConversion(item.price * item.quantity, product.currency as Currency, userCurrency).main : formatPriceWithConversion(item.price * item.quantity, (item.currency || 'CNY') as Currency, userCurrency).main}
                </p>
              </div>
            )
          })}
        </div>
        <div className="mt-4 border-t pt-4">
          {/* Calculate shipping fee by seller */}
          {loadingProducts ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">加载商品信息...</span>
            </div>
          ) : (
            <>
              {(() => {
                // Group items by seller_id
                const itemsBySeller = new Map<string, typeof selectedItems>()
                for (const item of selectedItems) {
                  const product = productMap.get(item.product_id)
                  if (product) {
                    const sellerId = product.seller_id
                    if (!itemsBySeller.has(sellerId)) {
                      itemsBySeller.set(sellerId, [])
                    }
                    itemsBySeller.get(sellerId)!.push(item)
                  }
                }

                let totalProductSubtotal = 0
                let totalShippingFee = 0
                
                // Calculate subtotal and shipping fee for each seller
                const sellerTotals = []
                for (const [sellerId, sellerItems] of Array.from(itemsBySeller.entries())) {
                  let productSubtotal = 0
                  let maxShippingFee = 0
                  
                  for (const item of sellerItems) {
                    const product = productMap.get(item.product_id)!
                    // Convert price to user currency before adding to subtotal
                    const convertedPrice = convertCurrency(item.price, (product.currency || item.currency || 'USD') as Currency, userCurrency)
                    productSubtotal += convertedPrice * item.quantity
                    const shippingFee = product.shipping_fee ?? 0
                    if (shippingFee > maxShippingFee) {
                      maxShippingFee = shippingFee
                    }
                  }
                  
                  totalProductSubtotal += productSubtotal
                  totalShippingFee += maxShippingFee
                  
                  sellerTotals.push({ sellerId, productSubtotal, shippingFee: maxShippingFee, total: productSubtotal + maxShippingFee })
                }

                const grandTotal = totalProductSubtotal + totalShippingFee

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t('productSubtotal') || '商品小计'}</span>
                      <span className="font-semibold">{formatPriceWithConversion(totalProductSubtotal, userCurrency, userCurrency).main}</span>
                    </div>
                    {totalShippingFee > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{t('shippingFee') || '运费'}</span>
                        <span className="font-semibold">{formatPriceWithConversion(totalShippingFee, userCurrency, userCurrency).main}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-semibold">{t('totalWithShipping') || '合计（含运费）'}</span>
                        <span className="text-xl font-bold">{formatPriceWithConversion(grandTotal, userCurrency, userCurrency).main}</span>
                      </div>
                  </>
                )
              })()}
            </>
          )}
        </div>
      </Card>

      {/* Shipping Address Selector */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('shippingAddress') || '收货信息'}</h2>
        <AddressSelector
          selectedAddressId={selectedAddress?.id || null}
          onSelectAddress={(address) => {
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
          }}
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
            <span className="ml-2 text-sm text-muted-foreground">加载可用支付方式...</span>
          </div>
        ) : availablePaymentMethods.length === 0 && !paymentMethodsError ? (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-3">
            <p className="text-sm text-destructive">
              {t('noPaymentMethodsAvailable')}
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
            {t('paymentMethodIntersectionHint')}
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
