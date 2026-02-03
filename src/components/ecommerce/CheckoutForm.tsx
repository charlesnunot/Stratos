'use client'

import { useState } from 'react'
import { useCartStore } from '@/store/cartStore'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

export function CheckoutForm() {
  const t = useTranslations('checkout')
  const tCommon = useTranslations('common')
  const { items, getTotal, clearCart } = useCartStore()
  const { toast } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const handleCheckout = async () => {
    if (!paymentMethod) {
      toast({
        variant: 'warning',
        title: tCommon('notice'),
        description: t('selectPaymentMethodPlaceholder'),
      })
      return
    }

    setLoading(true)
    try {
      // Create order logic here
      // After successful payment, clear cart
      clearCart()
      toast({
        variant: 'success',
        title: tCommon('success'),
        description: t('orderCreateSuccess'),
      })
    } catch (error) {
      console.error('Checkout error:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('checkoutFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-xl font-semibold">{t('pageTitle')}</h2>
      
      <div className="mb-4 space-y-2">
        <label className="text-sm font-medium">{t('paymentMethod')}</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2"
        >
          <option value="">{t('selectPaymentMethodPlaceholder')}</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="alipay">支付宝</option>
          <option value="wechat">微信支付</option>
          <option value="bank">银行转账</option>
        </select>
      </div>

      <div className="mb-4 border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <span>{t('totalItems')}</span>
          <span>{items.reduce((sum, item) => sum + item.quantity, 0)}</span>
        </div>
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>{t('total')}</span>
          <span>¥{getTotal().toFixed(2)}</span>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleCheckout}
        disabled={loading || items.length === 0}
      >
        {loading ? tCommon('processing') : t('confirmPay')}
      </Button>
    </Card>
  )
}
