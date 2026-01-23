'use client'

import { useState } from 'react'
import { useCartStore } from '@/store/cartStore'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function CheckoutForm() {
  const { items, getTotal, clearCart } = useCartStore()
  const { toast } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const handleCheckout = async () => {
    if (!paymentMethod) {
      toast({
        variant: 'warning',
        title: '提示',
        description: '请选择支付方式',
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
        title: '成功',
        description: '订单创建成功！',
      })
    } catch (error) {
      console.error('Checkout error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: '结算失败，请重试',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-xl font-semibold">结算</h2>
      
      <div className="mb-4 space-y-2">
        <label className="text-sm font-medium">支付方式</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2"
        >
          <option value="">请选择支付方式</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="alipay">支付宝</option>
          <option value="wechat">微信支付</option>
          <option value="bank">银行转账</option>
        </select>
      </div>

      <div className="mb-4 border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <span>商品总数</span>
          <span>{items.reduce((sum, item) => sum + item.quantity, 0)}</span>
        </div>
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>总计</span>
          <span>¥{getTotal().toFixed(2)}</span>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleCheckout}
        disabled={loading || items.length === 0}
      >
        {loading ? '处理中...' : '确认支付'}
      </Button>
    </Card>
  )
}
