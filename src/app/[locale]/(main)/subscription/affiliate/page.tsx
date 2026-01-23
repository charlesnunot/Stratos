'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { getCurrencyFromBrowser } from '@/lib/currency/detect-currency'
import { getSubscriptionPrice } from '@/lib/subscriptions/pricing'
import type { Currency } from '@/lib/currency/detect-currency'

export default function AffiliateSubscriptionPage() {
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState<Currency>('USD')
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'>('stripe')

  useEffect(() => {
    setCurrency(getCurrencyFromBrowser())
  }, [])

  const { amount, currency: payCurrency } = getSubscriptionPrice('affiliate', undefined, currency)

  const handleSubscribe = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    setLoading(true)
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      if (paymentMethod === 'stripe') {
        const response = await fetch('/api/payments/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            currency: payCurrency,
            subscriptionType: 'affiliate',
            userId: user.id,
            successUrl: `${window.location.origin}/subscription/success?type=affiliate`,
            cancelUrl: `${window.location.origin}/subscription/affiliate`,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create checkout session')
        }

        const { url } = await response.json()
        window.location.href = url
      } else if (paymentMethod === 'paypal') {
        return
      } else {
        const { error } = await supabase.from('subscriptions').insert({
          user_id: user.id,
          subscription_type: 'affiliate',
          payment_method: paymentMethod,
          amount,
          currency: payCurrency,
          starts_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          status: 'pending',
        })

        if (error) throw error

        // Update profile
        await supabase
          .from('profiles')
          .update({
            subscription_type: 'affiliate',
            subscription_expires_at: expiresAt.toISOString(),
          })
          .eq('id', user.id)

        toast({
          variant: 'success',
          title: '成功',
          description: '订阅已创建，请完成支付',
        })
        router.push('/subscription/manage')
      }
    } catch (error: any) {
      console.error('Subscription error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: error?.message || '订阅失败，请重试',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold">成为带货者</h1>
      
      <SubscriptionCard
        type="affiliate"
        price={amount}
        currency={currency}
        features={[
          '推广商品赚取佣金',
          '查看带货数据',
          '管理推广链接',
          '获取佣金收入',
          '查看统计报表',
        ]}
        onSubscribe={handleSubscribe}
        loading={loading}
      />

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">选择支付方式</h2>
        <PaymentMethodSelector
          selectedMethod={paymentMethod}
          onSelect={setPaymentMethod}
        />
      </Card>

      {paymentMethod === 'paypal' && (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">使用PayPal支付</h3>
          <PayPalButton
            amount={amount}
            currency={payCurrency}
            metadata={{
              type: 'subscription',
              subscriptionType: 'affiliate',
            }}
            onSuccess={async () => {
              router.push('/subscription/success?type=affiliate')
            }}
            onError={(error) => {
              toast({
                variant: 'destructive',
                title: '错误',
                description: `PayPal支付失败: ${error.message}`,
              })
            }}
          />
        </Card>
      )}
    </div>
  )
}
