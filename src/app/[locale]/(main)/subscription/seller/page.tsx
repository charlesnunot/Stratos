'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations, useMessages } from 'next-intl'
import { TieredSubscriptionCard, type SubscriptionTier } from '@/components/subscription/TieredSubscriptionCard'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { useSubscriptionBypassCheck } from '@/lib/hooks/useSubscriptionBypassCheck'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  Zap, 
  CreditCard, 
  CheckCircle2, 
  Sparkles,
  Lock,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowRight
} from 'lucide-react'
import { detectCurrency } from '@/lib/currency/detect-currency'
import { formatCurrency } from '@/lib/currency/format-currency'
import { getSellerTiers, getSubscriptionPrice } from '@/lib/subscriptions/pricing'
import { getWeChatQRCodeUrl } from '@/lib/utils/share'
import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import type { Currency } from '@/lib/currency/detect-currency'
import type { PaymentMethodId } from '@/app/api/platform/payment-methods/route'

// FAQ 数据现在从 messages 文件获取
const getFaqData = (t: any) => [
  {
    question: t('faq.items.0.question'),
    answer: t('faq.items.0.answer')
  },
  {
    question: t('faq.items.1.question'),
    answer: t('faq.items.1.answer')
  },
  {
    question: t('faq.items.2.question'),
    answer: t('faq.items.2.answer')
  },
  {
    question: t('faq.items.3.question'),
    answer: t('faq.items.3.answer')
  },
  {
    question: t('faq.items.4.question'),
    answer: t('faq.items.4.answer')
  }
]

// Unsplash 图片配置
const UNSPLASH_IMAGES = {
  // Hero 区域 - 电商/销售主题
  hero: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=600',
  // 定价区域 - 商业/金融主题
  pricing: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&h=600',
  // 支付区域 - 安全/信任主题
  payment: 'https://images.unsplash.com/photo-1578662996359-2400db6a37a9?w=600&h=400',
  // FAQ 区域 - 帮助/支持主题
  faq: 'https://images.unsplash.com/photo-1526662093473-9aab38988d3e?w=600&h=400',
}

// 图片卡片组件
function ImageCard({ 
  src, 
  alt, 
  className = '',
  overlay = false 
}: { 
  src: string
  alt: string
  className?: string
  overlay?: boolean
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover transition-transform duration-500 hover:scale-105"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
      {overlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
      )}
    </div>
  )
}

export default function SellerSubscriptionPage() {
  const locale = useLocale()
  const t = useTranslations('subscription')
  const tCommon = useTranslations('common')
  const messages = useMessages()
  const currency = useMemo<Currency>(
    () => detectCurrency({ browserLocale: locale }),
    [locale]
  )
  const [loading, setLoading] = useState(false)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [currentTier, setCurrentTier] = useState<number | null>(null)
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [wechatCodeUrl, setWechatCodeUrl] = useState<string | null>(null)
  const [wechatSubscriptionId, setWechatSubscriptionId] = useState<string | null>(null)
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('stripe')
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethodId[]>([])
  const [isFirstMonth, setIsFirstMonth] = useState(true)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)
  
  // 检查是否需要跳过订阅（内部用户/直营卖家）
  const { shouldBypass, isLoading: bypassLoading } = useSubscriptionBypassCheck()
  
  // 多币种支持状态
  const [platformCurrency, setPlatformCurrency] = useState<Currency>(currency)
  const [needsConversion, setNeedsConversion] = useState(false)
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)

  // 安全获取嵌套对象值的辅助函数
  const getNestedValue = (obj: any, path: string[]): any => {
    try {
      return path.reduce((acc, key) => acc?.[key], obj)
    } catch {
      return undefined
    }
  }

  // Direct sellers: no subscription needed, redirect to dashboard
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('seller_type')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        if ((data as { seller_type?: string }).seller_type === 'direct') {
          router.replace('/seller/dashboard')
        }
      })
    return () => { cancelled = true }
  }, [user, supabase, router])

  useEffect(() => {
    // 获取基础档位配置
    const baseTiers = getSellerTiers(currency)
    
    // 从 messages 对象获取订阅相关的翻译
    const subscriptionMessages = getNestedValue(messages, ['subscription']) || {}
    const pricingMessages = getNestedValue(subscriptionMessages, ['pricing']) || {}
    const tiersMessages = getNestedValue(pricingMessages, ['tiers']) || {}
    
    // 使用翻译函数更新档位文案
    const localizedTiers = baseTiers.map((tier) => {
      const tierKey = `${tier.tier}`
      const tierMessages = getNestedValue(tiersMessages, [tierKey]) || {}
      
      // 获取翻译后的名称和副标题（使用 t() 函数以支持参数插值）
      const name = t(`pricing.tiers.${tierKey}.name`)
      const subtitle = t(`pricing.tiers.${tierKey}.subtitle`)
      
      // 构建功能分组
      const groupKeys = tier.tier === 15 
        ? ['basic', 'products']
        : ['basic', 'products', 'marketing']
      
      const featureGroups = groupKeys.map((groupKey) => {
        const title = t(`pricing.tiers.${tierKey}.featureGroups.${groupKey}.title`)
        const features: string[] = []
        
        // 从 messages 对象直接获取功能列表（避免翻译函数报错）
        const groupMessages = getNestedValue(tierMessages, ['featureGroups', groupKey]) || {}
        const featuresArray = getNestedValue(groupMessages, ['features']) || []
        
        // 将功能数组转换为字符串数组
        if (Array.isArray(featuresArray)) {
          featuresArray.forEach((feature) => {
            if (typeof feature === 'string') {
              features.push(feature)
            }
          })
        }
        
        return { title, features }
      }).filter(group => group.features.length > 0)
      
      return {
        ...tier,
        name,
        subtitle,
        featureGroups,
      }
    })
    
    setTiers(localizedTiers)
  }, [currency, t, messages])

  // 获取平台可用的支付方式（与管理员设置同步）
  // 多币种支持：获取平台收款货币和是否需要转换
  useEffect(() => {
    const fetchAvailablePaymentMethods = async () => {
      try {
        const response = await fetch(`/api/platform/payment-methods?currency=${currency}`)
        if (!response.ok) {
          console.error('Failed to fetch payment methods')
          // 使用默认支付方式
          setAvailablePaymentMethods(['stripe', 'paypal'])
          return
        }
        const data = await response.json()
        setAvailablePaymentMethods(data.methods || [])
        
        // 多币种支持：保存平台货币和转换信息
        if (data.platformCurrency) {
          setPlatformCurrency(data.platformCurrency as Currency)
        }
        setNeedsConversion(data.needsConversion || false)
      } catch (error) {
        console.error('Error fetching payment methods:', error)
        // 出错时使用默认支付方式
        setAvailablePaymentMethods(['stripe', 'paypal'])
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

  // 多币种支持：当选择档位或货币变化时，计算转换后的金额
  useEffect(() => {
    const calculateConversion = async () => {
      if (!selectedTier || !needsConversion) {
        setConvertedAmount(null)
        setExchangeRate(null)
        return
      }

      try {
        // 获取档位价格
        const { amount: baseAmount } = getSubscriptionPrice('seller', selectedTier, currency)
        const amount = isFirstMonth ? baseAmount * 0.5 : baseAmount

        // 查询汇率并转换
        const response = await fetch(`/api/exchange-rates?from=${currency}&to=${platformCurrency}`)
        if (response.ok) {
          const data = await response.json()
          if (data.rate) {
            const converted = amount * data.rate
            setConvertedAmount(converted)
            setExchangeRate(data.rate)
          }
        }
      } catch (error) {
        console.error('Error calculating currency conversion:', error)
      }
    }

    calculateConversion()
  }, [selectedTier, currency, platformCurrency, needsConversion, isFirstMonth])

  // Get current subscription tier
  useEffect(() => {
    if (!user) return

    const fetchCurrentTier = async () => {
      const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('subscription_tier')
        .eq('user_id', user.id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('subscription_tier', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (subscription?.subscription_tier) {
        setCurrentTier(subscription.subscription_tier)
      }
    }

    fetchCurrentTier()
  }, [user, supabase])

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
          router.push(`/subscription/success?type=seller&tier=${selectedTier}`)
        }
      } catch (error) {
        console.error('Error checking payment status:', error)
      }
    }

    const interval = setInterval(checkPaymentStatus, 3000)

    return () => clearInterval(interval)
  }, [wechatSubscriptionId, user, supabase, router, locale, selectedTier])

  const handleSelectTier = (tier: number) => {
    setSelectedTier(tier)
    // Scroll to payment section
    setTimeout(() => {
      document.getElementById('payment-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleSubscribe = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    if (!selectedTier) {
      toast({
        variant: 'destructive',
        title: t('errors.title') || tCommon('error'),
        description: t('errors.selectTier'),
      })
      return
    }

    setLoading(true)
    try {
      const { amount: baseAmount, currency: payCurrency } = getSubscriptionPrice('seller', selectedTier, currency)
      const tierConfig = tiers.find((t) => t.tier === selectedTier)
      if (!tierConfig) throw new Error('Invalid tier')
      
      const amount = isFirstMonth ? baseAmount * 0.5 : baseAmount

      // Check if downgrading
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
            title: t('errors.cannotDowngrade'),
            description: t('payment.error.downgradeDesc', { 
              amount: formatCurrency(unfilledTotal, currency),
              tier: formatCurrency(tierConfig.depositCredit, currency)
            }),
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
            isFirstMonth,
            successUrl: `${window.location.origin}/${locale}/subscription/success?type=seller&tier=${selectedTier}`,
            cancelUrl: `${window.location.origin}/${locale}/subscription/seller`,
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
      } else if (paymentMethod === 'alipay' || paymentMethod === 'wechat') {
        // 多币种支持：传递用户货币和平台货币
        const pendingRes = await fetch('/api/subscriptions/create-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionType: 'seller',
            subscriptionTier: selectedTier,
            paymentMethod,
            currency: payCurrency,
            isFirstMonth,
            // 多币种支持字段
            userCurrency: currency,
            userAmount: amount,
            platformCurrency: needsConversion ? platformCurrency : currency,
            platformAmount: needsConversion ? convertedAmount : amount,
          }),
        })
        if (!pendingRes.ok) {
          const err = await pendingRes.json()
          throw new Error(err.error || 'Failed to create pending subscription')
        }
        const { subscriptionId } = await pendingRes.json()
        const payRes = await fetch('/api/subscriptions/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId, paymentMethod }),
        })
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
          toast({ 
            variant: 'default', 
            title: t('wechat.title'), 
            description: t('success.scanToPay')
          })
          return
        }
        throw new Error('Unexpected payment response')
      } else {
        // 多币种支持：传递用户货币和平台货币
        const response = await fetch('/api/subscriptions/create-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionType: 'seller',
            subscriptionTier: selectedTier,
            paymentMethod,
            currency: payCurrency,
            isFirstMonth,
            // 多币种支持字段
            userCurrency: currency,
            userAmount: amount,
            platformCurrency: needsConversion ? platformCurrency : currency,
            platformAmount: needsConversion ? convertedAmount : amount,
          }),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create pending subscription')
        }
        toast({ variant: 'success', title: tCommon('success'), description: t('success.subscriptionCreated') })
        router.push('/subscription/manage')
      }
    } catch (error: any) {
      console.error('Subscription error:', error)
      toast({
        variant: 'destructive',
        title: t('errors.title') || tCommon('error'),
        description: error.message || t('errors.subscriptionFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  const selectedTierConfig = tiers.find((t) => t.tier === selectedTier)

  // 加载状态检查
  if (bypassLoading) {
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
              {t('internalUserSellerDescription')}
            </p>
          </div>
          
          <div className="flex justify-center">
            <Link href="/support/tickets/create?type=seller&subject=申请开通卖家功能">
              <Button size="lg" className="w-full sm:w-auto">
                {t('applyForSeller')}
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5" />
        <div className="container mx-auto px-4 py-16 lg:py-24 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8 z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                <span>{t('hero.badge')}</span>
              </div>
              
              <div className="space-y-4">
                <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-tight">
                  {t('hero.title')}
                  <span className="text-primary"> {t('hero.titleHighlight')}</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-lg">
                  {t('hero.subtitle')}
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>{t('hero.zeroCommission')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>{t('hero.instantPayout')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>{t('hero.globalBuyers')}</span>
                </div>
              </div>

              <Button 
                size="lg" 
                className="gap-2"
                onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}
              >
                {t('hero.viewPlans')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Right Image */}
            <div className="relative hidden lg:block">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-video">
                <ImageCard 
                  src={UNSPLASH_IMAGES.hero} 
                  alt="Seller subscription" 
                  className="h-full w-full"
                  overlay={true}
                />
              </div>
              
              {/* Floating Stats */}
              <div className="absolute -bottom-6 -left-6 bg-card rounded-2xl shadow-xl p-4 border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">100%</p>
                    <p className="text-xs text-muted-foreground">{t('hero.stats.safe')}</p>
                  </div>
                </div>
              </div>
              
              <div className="absolute -top-6 -right-6 bg-card rounded-2xl shadow-xl p-4 border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">24h</p>
                    <p className="text-xs text-muted-foreground">{t('hero.stats.fast')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing-section" className="py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <ImageCard 
            src={UNSPLASH_IMAGES.pricing} 
            alt="Business pricing" 
            className="opacity-10"
          />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              {t('pricing.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('pricing.subtitle')}
            </p>
          </div>

          {/* Custom Subscription Tiers Display */}
          <div className="grid gap-10 md:grid-cols-1 lg:grid-cols-3">
            {tiers.map((tier) => {
              const isCurrentTier = currentTier === tier.tier;
              const isSelected = selectedTier === tier.tier;
              const isUpgrade = currentTier && tier.tier > currentTier;
              const isDowngrade = currentTier && tier.tier < currentTier;
              
              return (
                <div 
                  key={tier.tier}
                  className={`relative rounded-xl border p-5 bg-gradient-to-b from-card to-muted/20 shadow-sm hover:shadow-md transition-all duration-300 ${
                    tier.recommended 
                      ? 'border-primary/50 ring-1 ring-primary/20' 
                      : 'border-border'
                  } ${isCurrentTier ? 'border-green-500' : ''} ${
                    isSelected && !isCurrentTier 
                      ? 'ring-2 ring-primary ring-offset-2 border-primary shadow-lg' 
                      : ''
                  }`}
                >
                  {/* 推荐标签 */}
                  {tier.recommended && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5" />
                        <span className="font-bold text-xs">{t('pricing.recommended')}</span>
                      </div>
                    </div>
                  )}

                  {/* 当前档位标签 */}
                  {isCurrentTier && (
                    <div className="absolute -top-2 right-2.5">
                      <span className="bg-green-500 text-white px-1.5 py-0.5 rounded-full text-xs font-bold">
                        {t('pricing.current')}
                      </span>
                    </div>
                  )}

                  {/* 已选中标签 */}
                  {isSelected && !isCurrentTier && (
                    <div className="absolute -top-2 right-2.5">
                      <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full text-xs font-bold">
                        {t('pricing.selected')}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col h-full">
                    {/* 档位头部 */}
                    <div className="text-center mb-4">
                      <h3 className="text-lg font-bold mb-1 text-foreground">{tier.name}</h3>
                      <p className="text-muted-foreground text-sm">{tier.subtitle}</p>
                    </div>

                    {/* 价格显示 */}
                    <div className="text-center mb-3">
                      <div className="flex items-baseline justify-center gap-1">
                        {isFirstMonth && tier.displayPrice !== tier.price ? (
                          <>
                            <span className="text-muted-foreground line-through text-base">
                              {formatCurrency(tier.displayPrice, currency)}
                            </span>
                            <span className="text-2xl font-bold text-primary">
                              {formatCurrency(tier.displayPrice * 0.5, currency)}
                            </span>
                          </>
                        ) : (
                          <span className="text-2xl font-bold text-primary">
                            {formatCurrency(tier.displayPrice, currency)}
                          </span>
                        )}
                        <span className="text-muted-foreground text-sm">{t('perMonth')}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {isFirstMonth 
                          ? t('pricing.includesDiscounted', { 
                              original: tier.depositCredit, 
                              discounted: Math.round(tier.depositCredit * 0.5 * 100) / 100 
                            })
                          : t('pricing.includes', { amount: tier.depositCredit })
                        }
                      </p>
                      
                      {/* 首月折扣标签 */}
                      {isFirstMonth && (
                        <div className="mt-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          {t('pricing.firstMonthDiscount')}
                        </div>
                      )}
                    </div>

                    {/* 功能列表 */}
                    <div className="flex-1 mb-4">
                      {tier.featureGroups ? (
                        // 新格式：分组显示功能
                        <div className="space-y-3">
                          {tier.featureGroups.map((group, groupIndex) => (
                            <div key={groupIndex}>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                {group.title}
                              </h4>
                              <ul className="space-y-1.5">
                                {group.features.map((feature, featureIndex) => (
                                  <li key={featureIndex} className="flex items-start gap-1.5">
                                    <div className="mt-0.5 flex-shrink-0">
                                      <div className="h-3.5 w-3.5 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Check className="h-1.5 w-1.5 text-primary" />
                                      </div>
                                    </div>
                                    <span className="text-sm text-foreground">{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // 旧格式：扁平列表
                        <ul className="space-y-2">
                          {tier.features?.map((feature, index) => (
                            <li key={index} className="flex items-start gap-1.5">
                              <div className="mt-0.5 flex-shrink-0">
                                <div className="h-3.5 w-3.5 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Check className="h-1.5 w-1.5 text-primary" />
                                </div>
                              </div>
                              <span className="text-sm text-foreground">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* 选择按钮 */}
                    <Button
                      className="w-full h-10 text-base"
                      onClick={() => handleSelectTier(tier.tier)}
                      disabled={loading || isCurrentTier}
                      variant={isCurrentTier ? 'outline' : tier.recommended ? 'default' : 'secondary'}
                    >
                      {loading
                        ? t('pricing.processing')
                        : isCurrentTier
                          ? t('pricing.currentTierButton')
                          : isUpgrade
                            ? t('pricing.upgrade')
                            : isDowngrade
                              ? t('pricing.downgrade')
                              : t('pricing.selectTier')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Payment Section */}
      {selectedTier && selectedTierConfig && (
        <section id="payment-section" className="py-16 bg-muted/30 relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <ImageCard 
              src={UNSPLASH_IMAGES.payment} 
              alt="Secure payment" 
              className="opacity-5"
            />
          </div>
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 shadow-lg">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mb-4">
                    <CreditCard className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">{t('payment.title')}</h2>
                  <p className="text-muted-foreground">{t('payment.subtitle')}</p>
                </div>

                <PaymentMethodSelector
                  selectedMethod={paymentMethod}
                  onSelect={setPaymentMethod}
                  availableMethods={availablePaymentMethods}
                />

                {/* First Month Discount */}
                <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{t('payment.firstMonthOffer')}</p>
                        <p className="text-sm text-muted-foreground">{t('payment.limitedTime')}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isFirstMonth}
                        onChange={(e) => setIsFirstMonth(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  
                  {isFirstMonth && (
                    <div className="mt-4 pt-4 border-t border-primary/20">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('payment.originalPrice')}</span>
                        <span className="line-through">{formatCurrency(selectedTierConfig.price, currency)}{t('perMonth')}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-semibold text-primary">{t('payment.discountedPrice')}</span>
                        <span className="text-2xl font-bold text-primary">
                          {formatCurrency(selectedTierConfig.price * 0.5, currency)}
                          <span className="text-sm font-normal text-muted-foreground">{t('perMonth')}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {paymentMethod === 'paypal' && (
                  <div className="mt-6">
                    <PayPalButton
                      amount={isFirstMonth ? selectedTierConfig.price * 0.5 : selectedTierConfig.price}
                      currency={currency}
                      metadata={{
                        type: 'subscription',
                        subscriptionType: 'seller',
                        subscriptionTier: selectedTier.toString(),
                        isFirstMonth: isFirstMonth.toString(),
                      }}
                      onSuccess={async () => {
                        router.push(`/subscription/success?type=seller&tier=${selectedTier}`)
                      }}
                      onError={(error) => {
                        toast({
                          variant: 'destructive',
                          title: t('errors.title') || tCommon('error'),
                          description: t('payment.error.paymentFailed', { message: error.message }),
                        })
                      }}
                    />
                  </div>
                )}

                {paymentMethod !== 'paypal' && (
                  <Button
                    className="mt-6 w-full h-14 text-lg"
                    onClick={handleSubscribe}
                    disabled={loading || !!wechatCodeUrl}
                  >
                    {loading 
                      ? tCommon('processing') || t('pricing.processing')
                      : isFirstMonth 
                        ? t('payment.payNow', { amount: formatCurrency(selectedTierConfig.price * 0.5, currency) })
                        : t('payment.payNow', { amount: formatCurrency(selectedTierConfig.price, currency) })
                    }
                  </Button>
                )}

                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  <span>{t('payment.secure')}</span>
                </div>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* WeChat QR Code Section */}
      {wechatCodeUrl && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-md mx-auto">
              <Card className="p-8 text-center">
                <h3 className="text-xl font-semibold mb-6">{t('wechat.title')}</h3>
                <div className="bg-white p-4 rounded-xl inline-block mb-4">
                  <img
                    src={getWeChatQRCodeUrl(wechatCodeUrl)}
                    alt="WeChat Pay QR Code"
                    className="h-48 w-48"
                  />
                </div>
                <p className="text-muted-foreground mb-6">{t('wechat.scan')}</p>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWechatCodeUrl(null)
                      setWechatSubscriptionId(null)
                    }}
                  >
                    {t('wechat.back')}
                  </Button>
                  <Button asChild>
                    <Link href="/subscription/manage">{t('wechat.manage')}</Link>
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* FAQ Section */}
      <section className="py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <ImageCard 
            src={UNSPLASH_IMAGES.faq} 
            alt="FAQ section" 
            className="opacity-10"
          />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-4">{t('faq.title')}</h2>
            <p className="text-lg text-muted-foreground">
              {t('faq.subtitle')}
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {getFaqData(t).map((faq, index) => (
              <Card 
                key={index} 
                className="overflow-hidden cursor-pointer transition-all hover:shadow-md"
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
                    <div className="mt-4 pt-4 border-t text-muted-foreground pl-8">
                      {faq.answer}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
