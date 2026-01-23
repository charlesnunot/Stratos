'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TieredSubscriptionCard, type SubscriptionTier } from '@/components/subscription/TieredSubscriptionCard'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import { getCurrencyFromBrowser } from '@/lib/currency/detect-currency'
import { formatCurrency } from '@/lib/currency/format-currency'
import { getSellerTiers, getSubscriptionPrice } from '@/lib/subscriptions/pricing'
import type { Currency } from '@/lib/currency/detect-currency'

export default function SellerSubscriptionPage() {
  const [loading, setLoading] = useState(false)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [currentTier, setCurrentTier] = useState<number | null>(null)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'>('stripe')

  useEffect(() => {
    setCurrency(getCurrencyFromBrowser())
  }, [])

  useEffect(() => {
    setTiers(getSellerTiers(currency))
  }, [currency])

  // Get current subscription tier
  useEffect(() => {
    if (!user) return

    const fetchCurrentTier = async () => {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('subscription_tier')
        .eq('user_id', user.id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('subscription_tier', { ascending: false })
        .limit(1)
        .single()

      if (subscription?.subscription_tier) {
        setCurrentTier(subscription.subscription_tier)
      }
    }

    fetchCurrentTier()
  }, [user, supabase])

  const handleSelectTier = (tier: number) => {
    setSelectedTier(tier)
  }

  const handleSubscribe = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    if (!selectedTier) {
      toast({
        variant: 'destructive',
        title: '错误',
        description: '请选择订阅档位',
      })
      return
    }

    setLoading(true)
    try {
      const { amount, currency: payCurrency } = getSubscriptionPrice('seller', selectedTier, currency)
      const tierConfig = tiers.find((t) => t.tier === selectedTier)
      if (!tierConfig) throw new Error('Invalid tier')

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      // Check if downgrading (need to verify unfilled orders)
      if (currentTier && selectedTier < currentTier) {
        const { data: orders } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('seller_id', user.id)
          .eq('payment_status', 'paid')
          .in('order_status', ['pending', 'paid', 'shipped'])

        const unfilledTotal = orders?.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0) || 0

        if (unfilledTotal > selectedTier) {
          toast({
            variant: 'destructive',
            title: '无法降级',
            description: `您当前的未履行订单总额为 ${formatCurrency(unfilledTotal, currency)}，超过了 ${formatCurrency(tierConfig.depositCredit, currency)} 档位的保证金额度。请先完成订单或升级到更高档位。`,
          })
          setLoading(false)
          return
        }
      }

      if (paymentMethod === 'stripe') {
        const response = await fetch('/api/payments/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            currency: payCurrency,
            subscriptionType: 'seller',
            subscriptionTier: selectedTier,
            userId: user.id,
            successUrl: `${window.location.origin}/subscription/success?type=seller&tier=${selectedTier}`,
            cancelUrl: `${window.location.origin}/subscription/seller`,
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
          subscription_type: 'seller',
          subscription_tier: selectedTier,
          deposit_credit: selectedTier,
          payment_method: paymentMethod,
          amount,
          currency: payCurrency,
          starts_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          status: 'pending',
        })

        if (error) throw error

        await supabase
          .from('profiles')
          .update({
            subscription_type: 'seller',
            seller_subscription_tier: selectedTier,
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
        description: error.message || '订阅失败，请重试',
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedTierConfig = tiers.find((t) => t.tier === selectedTier)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">卖家订阅</h1>
        <p className="mt-2 text-muted-foreground">
          选择适合您的订阅档位。订阅费用 = 免费保证金额度，支持更大额的订单。
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          订阅费用直接等于免费保证金额度。例如：订阅 {formatCurrency(15, currency)}/月，您可以在未履行订单总额不超过 {formatCurrency(15, currency)} 的情况下正常销售，无需额外保证金。
        </AlertDescription>
      </Alert>

      <TieredSubscriptionCard
        tiers={tiers}
        currentTier={currentTier || undefined}
        currency={currency}
        onSelectTier={handleSelectTier}
        loading={loading}
      />

      {selectedTier && selectedTierConfig && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">选择支付方式</h2>
          <PaymentMethodSelector
            selectedMethod={paymentMethod}
            onSelect={setPaymentMethod}
          />

          {paymentMethod === 'paypal' && (
            <div className="mt-4">
              <PayPalButton
                amount={selectedTierConfig.price}
                currency={currency}
                metadata={{
                  type: 'subscription',
                  subscriptionType: 'seller',
                  subscriptionTier: selectedTier.toString(),
                }}
                onSuccess={async () => {
                  router.push(`/subscription/success?type=seller&tier=${selectedTier}`)
                }}
                onError={(error) => {
                  toast({
                    variant: 'destructive',
                    title: '错误',
                    description: `PayPal支付失败: ${error.message}`,
                  })
                }}
              />
            </div>
          )}

          {paymentMethod !== 'paypal' && (
            <Button
              className="mt-4 w-full"
              onClick={handleSubscribe}
              disabled={loading}
            >
              {loading ? '处理中...' : `订阅 ${formatCurrency(selectedTierConfig.price, currency)}/月`}
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
