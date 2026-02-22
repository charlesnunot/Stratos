'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { usePlatformAccount } from '@/lib/hooks/usePlatformAccount'
import { useSubscriptionBypassCheck } from '@/lib/hooks/useSubscriptionBypassCheck'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency/format-currency'
import { convertCurrency, convertCurrencyAsync } from '@/lib/currency/convert-currency'
import { detectCurrency } from '@/lib/currency/detect-currency'
import { getSubscriptionPrice } from '@/lib/subscriptions/pricing'
import { getWeChatQRCodeUrl } from '@/lib/utils/share'
import { CreditCard, Lock, Heart, Gift, Star, Shield, Sparkles, HelpCircle, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import type { Currency } from '@/lib/currency/detect-currency'
import type { PaymentMethodId } from '@/app/api/platform/payment-methods/route'

// Unsplash 免费图片配置 - 打赏/创作者支持主题
const UNSPLASH_IMAGES = {
  // Hero 区域 - 创作者/艺术主题
  hero: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1200&h=800',
  // 功能展示区域 - 连接/社区主题
  features: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600',
  // 支付区域 - 安全/信任主题
  payment: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&h=400',
}

// 图片卡片组件
function ImageCard({
  src,
  alt,
  className = '',
  overlay = false,
  priority = false
}: {
  src: string
  alt: string
  className?: string
  overlay?: boolean
  priority?: boolean
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover transition-transform duration-700 hover:scale-105"
        sizes="(max-width: 768px) 100vw, 50vw"
        priority={priority}
      />
      {overlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
      )}
    </div>
  )
}

// FAQ 数据
const getFaqData = (t: any) => [
  {
    question: t('faq.tip.items.0.question'),
    answer: t('faq.tip.items.0.answer')
  },
  {
    question: t('faq.tip.items.1.question'),
    answer: t('faq.tip.items.1.answer')
  },
  {
    question: t('faq.tip.items.2.question'),
    answer: t('faq.tip.items.2.answer')
  },
  {
    question: t('faq.tip.items.3.question'),
    answer: t('faq.tip.items.3.answer')
  }
]

export default function TipSubscriptionPage() {
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [wechatCodeUrl, setWechatCodeUrl] = useState<string | null>(null)
  const [wechatSubscriptionId, setWechatSubscriptionId] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethodId[]>([])
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)
  const [platformConvertedAmount, setPlatformConvertedAmount] = useState<number | null>(null)
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('subscription')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('stripe')
  
  // 检查是否需要跳过订阅（内部用户/直营卖家）
  const { shouldBypass, isLoading: bypassLoading } = useSubscriptionBypassCheck()
  
  // 检查用户是否已订阅打赏功能
  const { 
    isTipEnabled, 
    isLoading: subscriptionLoading, 
    hasPaymentAccount, 
    payoutEligibility 
  } = useSubscription()

  // 获取平台收款账户信息
  const { account: platformAccount, loading: platformAccountLoading } = usePlatformAccount(currency)

  const SUBSCRIPTION_TIMEOUT_MS = 25000

  // 已订阅且有收款账户的用户重定向到打赏中心
  const hasValidPaymentAccount = hasPaymentAccount && payoutEligibility === 'eligible'
  
  useEffect(() => {
    if (!subscriptionLoading && isTipEnabled && hasValidPaymentAccount && !shouldBypass) {
      router.replace('/tip-center')
    }
  }, [subscriptionLoading, isTipEnabled, hasValidPaymentAccount, shouldBypass, router])

  // 根据页面 locale 设置货币
  useEffect(() => {
    const currencyFromLocale = detectCurrency({ browserLocale: locale })
    setCurrency(currencyFromLocale)
  }, [locale])

  // 获取平台可用的支付方式
  useEffect(() => {
    const fetchAvailablePaymentMethods = async () => {
      try {
        const response = await fetch(`/api/platform/payment-methods?currency=${currency}`)
        if (!response.ok) {
          console.error('Failed to fetch payment methods')
          return
        }
        const data = await response.json()
        setAvailablePaymentMethods(data.methods || [])
      } catch (error) {
        console.error('Error fetching payment methods:', error)
      }
    }

    fetchAvailablePaymentMethods()
  }, [currency])

  useEffect(() => {
    if (availablePaymentMethods.length === 0) return
    if (!availablePaymentMethods.includes(paymentMethod)) {
      setPaymentMethod(availablePaymentMethods[0])
    }
  }, [currency, availablePaymentMethods, paymentMethod])

  useEffect(() => {
    if (!wechatSubscriptionId || !user) return

    const checkPaymentStatus = async () => {
      try {
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('id', wechatSubscriptionId)
          .single()

        if (subscription?.status === 'active') {
          setWechatCodeUrl(null)
          setWechatSubscriptionId(null)
          router.push('/subscription/success?type=tip')
        }
      } catch (error) {
        console.error('Error checking payment status:', error)
      }
    }

    const interval = setInterval(checkPaymentStatus, 3000)
    return () => clearInterval(interval)
  }, [wechatSubscriptionId, user, supabase, router, locale])

  // 计算用户看到的金额（基于用户货币）
  const { amount: userAmount, currency: userCurrency } = getSubscriptionPrice('tip', undefined, currency)

  // 平台收款货币和金额
  const platformCurrency = platformAccount?.currency || currency
  const needsConversion = currency !== platformCurrency

  // 异步获取平台货币金额
  useEffect(() => {
    const fetchPlatformAmount = async () => {
      if (!needsConversion) {
        setPlatformConvertedAmount(userAmount)
        return
      }
      try {
        const converted = await convertCurrencyAsync(userAmount, currency, platformCurrency)
        setPlatformConvertedAmount(converted)
      } catch (error) {
        console.error('Error converting currency:', error)
        setPlatformConvertedAmount(convertCurrency(userAmount, currency, platformCurrency))
      }
    }

    fetchPlatformAmount()
  }, [userAmount, currency, platformCurrency, needsConversion])

  // 加载状态检查
  if (bypassLoading || subscriptionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // 已订阅用户正在重定向
  if (isTipEnabled && !shouldBypass) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // 内部用户显示申请开通提示
  if (shouldBypass) {
    return (
      <div className="mx-auto max-w-2xl py-12 px-4">
        <Card className="p-8 text-center">
          <div className="mb-6">
            <Badge variant="secondary" className="mb-4 text-sm">
              {t('internalUserBadge')}
            </Badge>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t('internalUserTipDescription')}
            </p>
          </div>
          
          <div className="flex justify-center">
            <Link href="/support/tickets/create?type=tip&subject=申请开通打赏功能">
              <Button size="lg" className="w-full sm:w-auto">
                {t('applyForTip')}
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // 计算每次打赏的最大金额（基准 35 CNY，根据汇率转换为当前货币）
  const maxTipAmount = convertCurrency(35, 'CNY', currency)
  const formattedMaxTipAmount = formatCurrency(maxTipAmount, currency)

  // 动态替换 feature 列表中的占位符
  const features = (t.raw('tipFeatures') as string[]).map(feature =>
    feature.replace('{amount}', formattedMaxTipAmount)
  )

  // 实际支付金额（平台货币）
  const payAmount = platformConvertedAmount || userAmount
  const payCurrency = platformCurrency

  const handleSelectSubscription = () => {
    if (!user) {
      router.push('/login')
      return
    }
    setShowPayment(true)
    setTimeout(() => {
      document.getElementById('payment-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleSubscribe = async () => {
    setLoading(true)
    try {
      if (paymentMethod === 'stripe') {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), SUBSCRIPTION_TIMEOUT_MS)
        const response = await fetch('/api/payments/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: payAmount,
            currency: payCurrency,
            subscriptionType: 'tip',
            userId: user!.id,
            successUrl: `${window.location.origin}/${locale}/subscription/success?type=tip`,
            cancelUrl: `${window.location.origin}/${locale}/subscription/tip`,
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
            subscriptionType: 'tip',
            paymentMethod,
            currency: payCurrency,
            amount: payAmount,
            userCurrency: currency,
            userAmount: userAmount,
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
            subscriptionType: 'tip',
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
    <div className="min-h-screen bg-background">
      {/* Hero Section - 大图背景 */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        {/* 背景图片 */}
        <div className="absolute inset-0">
          <Image
            src={UNSPLASH_IMAGES.hero}
            alt="Support creators"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/40 to-background" />
        </div>

        {/* Hero 内容 */}
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            {/* 徽章 */}
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20 px-4 py-2 text-sm font-medium text-primary mb-8">
              <Sparkles className="h-4 w-4" />
              <span>{t('tip.hero.badge') || 'Support Your Favorite Creators'}</span>
            </div>

            {/* 标题 */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              {t('tip.hero.title') || 'Show Your'}
              <span className="text-primary block mt-2">{t('tip.hero.titleHighlight') || 'Appreciation'}</span>
            </h1>

            {/* 副标题 */}
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              {t('tip.hero.subtitle') || 'Enable tipping to support creators you love. Your support helps them create more amazing content.'}
            </p>

            {/* 特性标签 */}
            <div className="flex flex-wrap justify-center gap-6 mb-12">
              <div className="flex items-center gap-2 text-sm">
                <Heart className="h-5 w-5 text-rose-500" />
                <span>{t('tip.hero.feature1') || 'Direct Support'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-5 w-5 text-primary" />
                <span>{t('tip.hero.feature2') || 'Secure Payments'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-5 w-5 text-amber-500" />
                <span>{t('tip.hero.feature3') || 'Instant Delivery'}</span>
              </div>
            </div>

            {/* CTA 按钮 */}
            <Button
              size="lg"
              className="gap-2 text-lg px-8 py-6"
              onClick={() => document.getElementById('subscribe-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t('tip.hero.cta') || 'Get Started'}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Subscribe Section */}
      <section id="subscribe-section" className="py-24 relative">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            {/* 区域标题 */}
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('tip.pricing.title') || 'Simple Pricing'}</h2>
              <p className="text-lg text-muted-foreground">{t('tip.pricing.subtitle') || 'One plan, unlimited appreciation'}</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* 左侧：图片 */}
              <div className="relative">
                <ImageCard
                  src={UNSPLASH_IMAGES.features}
                  alt="Creator community"
                  className="aspect-[4/3] shadow-2xl"
                  overlay
                />
                {/* 浮动卡片 */}
                <div className="absolute -bottom-6 -right-6 bg-card rounded-2xl shadow-xl p-6 border max-w-[200px]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                      <Heart className="h-5 w-5 text-rose-500" />
                    </div>
                    <div>
                      <p className="font-bold text-2xl">100%</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('tip.pricing.toCreator') || 'Goes to creators'}</p>
                </div>
              </div>

              {/* 右侧：订阅卡片 */}
              <div>
                <SubscriptionCard
                  type="tip"
                  price={userAmount}
                  currency={currency}
                  features={features}
                  onSubscribe={handleSelectSubscription}
                  loading={loading || !!wechatCodeUrl}
                  hideSubscribeButton={false}
                  title={t('tipSubscription')}
                  description={t('tipDescriptionShort')}
                  subscribeLabel={t('subscribeNow')}
                  processingLabel={t('processing')}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Payment Section */}
      {showPayment && (
        <section id="payment-section" className="py-24 bg-muted/30 relative">
          <div className="absolute inset-0 opacity-5">
            <ImageCard src={UNSPLASH_IMAGES.payment} alt="Secure payment" className="h-full" />
          </div>
          <div className="container mx-auto px-4 relative">
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 shadow-xl border-0">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
                    <CreditCard className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">{t('payment.title') || 'Complete Payment'}</h2>
                  <p className="text-muted-foreground">{t('payment.subtitle') || 'Select your preferred payment method'}</p>
                </div>

                <PaymentMethodSelector
                  selectedMethod={paymentMethod}
                  onSelect={setPaymentMethod}
                  availableMethods={availablePaymentMethods}
                />

                {paymentMethod === 'paypal' && (
                  <div className="mt-6">
                    <PayPalButton
                      amount={payAmount}
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
                          title: tCommon('error'),
                          description: `${t('paypalFailed')}: ${error.message}`,
                        })
                      }}
                    />
                  </div>
                )}

                {paymentMethod !== 'paypal' && (
                  <Button
                    className="mt-6 w-full h-14 text-lg"
                    onClick={handleSubscribe}
                    disabled={loading || !!wechatCodeUrl || platformAccountLoading}
                  >
                    {loading || platformAccountLoading
                      ? tCommon('processing') || t('processing')
                      : t('payment.payNow', { amount: formatCurrency(payAmount, payCurrency) }) || `Pay ${formatCurrency(payAmount, payCurrency)}`
                    }
                  </Button>
                )}

                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  <span>{t('payment.secure') || 'Secure payment processing'}</span>
                </div>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* WeChat QR Code Section */}
      {wechatCodeUrl && (
        <section className="py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-md mx-auto">
              <Card className="p-8 text-center shadow-xl border-0">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 mb-4">
                  <Gift className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-xl font-semibold mb-6">{t('wechatScanPay')}</h3>
                <div className="bg-white p-4 rounded-xl inline-block mb-4">
                  <img
                    src={getWeChatQRCodeUrl(wechatCodeUrl)}
                    alt="WeChat Pay QR Code"
                    className="h-48 w-48"
                  />
                </div>
                <p className="text-muted-foreground mb-6">{t('wechatScanPayHint')}</p>
                <div className="flex gap-3 justify-center">
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
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* FAQ Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">{t('faq.title')}</h2>
              <p className="text-lg text-muted-foreground">{t('faq.subtitle')}</p>
            </div>

            <div className="space-y-4">
              {getFaqData(t).map((faq, index) => (
                <Card
                  key={index}
                  className="overflow-hidden cursor-pointer transition-all hover:shadow-md border-0 shadow-sm"
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <HelpCircle className="h-5 w-5 text-primary flex-shrink-0" />
                        <h3 className="font-semibold">{faq.question}</h3>
                      </div>
                      {openFaqIndex === index ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    {openFaqIndex === index && (
                      <div className="mt-4 pt-4 border-t text-muted-foreground leading-relaxed">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
