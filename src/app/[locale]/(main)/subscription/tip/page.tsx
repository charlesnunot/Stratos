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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import { getCurrencyFromBrowser } from '@/lib/currency/detect-currency'
import { getSubscriptionPrice } from '@/lib/subscriptions/pricing'
import type { Currency } from '@/lib/currency/detect-currency'

export default function TipSubscriptionPage() {
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

  const { amount, currency: payCurrency } = getSubscriptionPrice('tip', undefined, currency)

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
            subscriptionType: 'tip',
            userId: user.id,
            successUrl: `${window.location.origin}/subscription/success?type=tip`,
            cancelUrl: `${window.location.origin}/subscription/tip`,
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
          subscription_type: 'tip',
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
            subscription_type: 'tip',
            subscription_expires_at: expiresAt.toISOString(),
            tip_enabled: true, // Will be set by trigger, but update here for consistency
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
        description: error.message || '订阅失败，请重试',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">打赏功能订阅</h1>
        <p className="mt-2 text-muted-foreground">
          订阅后即可使用打赏功能，向您喜欢的创作者表达支持
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          订阅打赏功能后，您可以：
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>向任意创作者打赏（每次最多35 CNY）</li>
            <li>每天最多向同一创作者打赏3次</li>
            <li>支持多种支付方式（Stripe、PayPal、支付宝、微信支付等）</li>
          </ul>
        </AlertDescription>
      </Alert>

      <SubscriptionCard
        type="tip"
        price={amount}
        currency={currency}
        features={[
          '启用打赏功能',
          '每次最多打赏35 CNY',
          '每天最多向同一创作者打赏3次',
          '支持多种支付方式',
          '实时到账通知',
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
              subscriptionType: 'tip',
            }}
            onSuccess={async () => {
              router.push('/subscription/success?type=tip')
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
