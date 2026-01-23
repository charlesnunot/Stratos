'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { useCartStore } from '@/store/cartStore'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function CheckoutPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const { items, getTotal, clearCart } = useCartStore()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'>('stripe')
  const t = useTranslations('checkout')
  const tOrders = useTranslations('orders')
  const tPayments = useTranslations('payments')
  const tCommon = useTranslations('common')

  if (!user) {
    router.push('/login')
    return null
  }

  if (items.length === 0) {
    router.push('/')
    return null
  }

  const handleCheckout = async () => {
    setLoading(true)
    try {
      // Get product details to determine seller
      const productIds = items.map((item) => item.product_id)
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, seller_id')
        .in('id', productIds)

      if (productsError || !products) throw productsError || new Error('Failed to fetch products')

      // Group items by seller (assuming single seller per order for simplicity)
      // In a real scenario, you might want to create multiple orders per seller
      const sellerId = products[0]?.seller_id
      if (!sellerId) throw new Error('Invalid seller')

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`

      // Create order (using the first item's product for simplicity)
      // In production, you might want to create separate orders per seller
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          buyer_id: user.id,
          seller_id: sellerId,
          product_id: items[0].product_id, // First product for compatibility
          quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          unit_price: items[0].price, // First item price for compatibility
          total_amount: getTotal(),
          payment_method: paymentMethod,
          payment_status: 'pending',
          order_status: 'pending',
        })
        .select()
        .single()

      if (orderError) throw orderError

      // Create order items if table exists
      try {
        const orderItems = items.map((item) => ({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
        }))

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems)

        // Ignore error if table doesn't exist yet
        if (itemsError && !itemsError.message.includes('does not exist')) {
          console.warn('Failed to create order items:', itemsError)
        }
      } catch (err) {
        // Table might not exist, continue anyway
        console.warn('Order items table might not exist:', err)
      }

      // Clear cart
      clearCart()

      // Redirect to payment or order confirmation
      router.push(`/orders/${order.id}`)
    } catch (error) {
      console.error('Checkout error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: tOrders('orderCreateFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>

      {/* Order Items */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('orderDetails')}</h2>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.product_id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-12 w-12 rounded object-cover"
                />
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('quantity')}: {item.quantity} × ¥{item.price.toFixed(2)}
                  </p>
                </div>
              </div>
              <p className="font-semibold">
                ¥{(item.price * item.quantity).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">{tOrders('totalAmount')}</span>
            <span className="text-xl font-bold">¥{getTotal().toFixed(2)}</span>
          </div>
        </div>
      </Card>

      {/* Payment Method */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('paymentMethod')}</h2>
        <div className="space-y-2">
          {(['stripe', 'paypal', 'alipay', 'wechat', 'bank'] as const).map((method) => (
            <label
              key={method}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-muted"
            >
              <input
                type="radio"
                name="payment"
                value={method}
                checked={paymentMethod === method}
                onChange={() => setPaymentMethod(method)}
                className="h-4 w-4"
              />
              <span className="capitalize">
                💳 {tPayments(method)}
              </span>
            </label>
          ))}
        </div>
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
