'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getCurrencyFromBrowser } from '@/lib/currency/detect-currency'
import { getSubscriptionPrice } from '@/lib/subscriptions/pricing'
import { getWeChatQRCodeUrl } from '@/lib/utils/share'
import Link from 'next/link'
import type { Currency } from '@/lib/currency/detect-currency'

export default function AffiliateSubscriptionPage() {
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState<Currency>('USD')
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
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), SUBSCRIPTION_TIMEOUT_MS)
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
            subscriptionType: 'affiliate',
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
            subscriptionType: 'affiliate',
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold">{t('affiliateTitle')}</h1>
      
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
        loading={loading || !!wechatCodeUrl}
        hideSubscribeButton={paymentMethod === 'paypal'}
        usePayPalHint={paymentMethod === 'paypal' ? t('usePayPalBelow') : undefined}
        title={t('becomeAffiliate')}
        description={t('affiliateDescriptionShort')}
        subscribeLabel={t('subscribeNow')}
        processingLabel={t('processing')}
      />

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('selectPayment')}</h2>
        <PaymentMethodSelector
          selectedMethod={paymentMethod}
          onSelect={setPaymentMethod}
        />
      </Card>

      {paymentMethod === 'paypal' && (
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">{t('usePayPal')}</h3>
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
                title: tCommon('error'),
                description: `${t('paypalFailed')}: ${error.message}`,
              })
            }}
          />
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
