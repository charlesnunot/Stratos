'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
import { getWeChatQRCodeUrl } from '@/lib/utils/share'
import Link from 'next/link'
import type { Currency } from '@/lib/currency/detect-currency'

export default function SellerSubscriptionPage() {
  const [loading, setLoading] = useState(false)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [currentTier, setCurrentTier] = useState<number | null>(null)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [wechatCodeUrl, setWechatCodeUrl] = useState<string | null>(null)
  const [wechatSubscriptionId, setWechatSubscriptionId] = useState<string | null>(null)
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('subscription')
  const tCommon = useTranslations('common')
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'>('stripe')

  const SUBSCRIPTION_TIMEOUT_MS = 25000

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
        title: tCommon('error'),
        description: t('selectTierRequired'),
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
            title: t('cannotDowngrade'),
            description: t('cannotDowngradeDescription', {
              unfilled: formatCurrency(unfilledTotal, currency),
              limit: formatCurrency(tierConfig.depositCredit, currency),
            }),
          })
          setLoading(false)
          return
        }
      }

      if (paymentMethod === 'stripe') {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), SUBSCRIPTION_TIMEOUT_MS)
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
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create checkout session')
        }

        const { url } = await response.json()
        window.location.href = url
      } else if (paymentMethod === 'paypal') {
        return
      } else if (paymentMethod === 'alipay' || paymentMethod === 'wechat') {
        const c1 = new AbortController()
        const t1 = setTimeout(() => c1.abort(), SUBSCRIPTION_TIMEOUT_MS)
        const pendingRes = await fetch('/api/subscriptions/create-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionType: 'seller',
            subscriptionTier: selectedTier,
            paymentMethod,
            currency: payCurrency,
          }),
          signal: c1.signal,
        })
        clearTimeout(t1)
        if (!pendingRes.ok) {
          const err = await pendingRes.json()
          throw new Error(err.error || 'Failed to create pending subscription')
        }
        const { subscriptionId } = await pendingRes.json()
        const c2 = new AbortController()
        const t2 = setTimeout(() => c2.abort(), SUBSCRIPTION_TIMEOUT_MS)
        const payRes = await fetch('/api/subscriptions/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId, paymentMethod }),
          signal: c2.signal,
        })
        clearTimeout(t2)
        if (!payRes.ok) {
          const err = await payRes.json()
          throw new Error(err.error || 'Failed to create payment')
        }
        const result = await payRes.json()
        if (paymentMethod === 'alipay' && result.formAction && result.formData) {
          const form = document.createElement('form')
          form.method = 'POST'
          form.action = result.formAction
          Object.entries(result.formData).forEach(([k, v]) => {
            const input = document.createElement('input')
            input.type = 'hidden'
            input.name = k
            input.value = typeof v === 'string' ? v : String(v ?? '')
            form.appendChild(input)
          })
          document.body.appendChild(form)
          form.submit()
          return
        }
        if (paymentMethod === 'wechat' && result.codeUrl) {
          setWechatCodeUrl(result.codeUrl)
          setWechatSubscriptionId(result.subscriptionId || subscriptionId)
          toast({ variant: 'default', title: t('wechatScanPay'), description: t('wechatScanPayHint') })
          return
        }
        throw new Error('Unexpected payment response')
      } else {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), SUBSCRIPTION_TIMEOUT_MS)
        const response = await fetch('/api/subscriptions/create-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionType: 'seller',
            subscriptionTier: selectedTier,
            paymentMethod,
            currency: payCurrency,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create pending subscription')
        }
        toast({ variant: 'success', title: tCommon('success'), description: t('subscriptionCreated') })
        router.push('/subscription/manage')
      }
    } catch (error: unknown) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Subscription error:', error)
      }
      const isAbort = error instanceof Error && error.name === 'AbortError'
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: isAbort ? t('requestTimeoutRetry') : (error instanceof Error ? error.message : t('subscriptionFailed')),
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedTierConfig = tiers.find((t) => t.tier === selectedTier)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('sellerTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('sellerDescription')}</p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {t('sellerAlert', { price: formatCurrency(15, currency) })}
        </AlertDescription>
      </Alert>

      <TieredSubscriptionCard
        tiers={tiers}
        currentTier={currentTier || undefined}
        currency={currency}
        onSelectTier={handleSelectTier}
        loading={loading || !!wechatCodeUrl}
      />

      {selectedTier && selectedTierConfig && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('selectPayment')}</h2>
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
                    title: tCommon('error'),
                    description: `${t('paypalFailed')}: ${error.message}`,
                  })
                }}
              />
            </div>
          )}

          {paymentMethod !== 'paypal' && (
            <Button
              className="mt-4 w-full"
              onClick={handleSubscribe}
              disabled={loading || !!wechatCodeUrl}
            >
              {loading ? t('processing') : `${t('subscribe')} ${formatCurrency(selectedTierConfig.price, currency)}${t('perMonth')}`}
            </Button>
          )}
        </Card>
      )}

      {wechatCodeUrl && (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">{t('wechatScanPay')}</h3>
          <div className="flex flex-col items-center gap-4">
            <img
              src={getWeChatQRCodeUrl(wechatCodeUrl)}
              alt="微信支付二维码"
              className="h-48 w-48"
            />
            <p className="text-sm text-muted-foreground">{t('wechatScanPayHint')}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setWechatCodeUrl(null)
                  setWechatSubscriptionId(null)
                }}
              >
                {t('backToRetry')}
              </Button>
              <Button asChild>
                <Link href="/subscription/manage">{t('goToManage')}</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
