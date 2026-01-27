'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, CreditCard, AlertCircle, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { formatCurrency } from '@/lib/currency/format-currency'
import { getCurrencyFromBrowser } from '@/lib/currency/detect-currency'
import { getWeChatQRCodeUrl } from '@/lib/utils/share'
import type { Currency } from '@/lib/currency/detect-currency'

export default function DepositPayPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('deposit')
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'>('stripe')
  const [processing, setProcessing] = useState(false)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [wechatCodeUrl, setWechatCodeUrl] = useState<string | null>(null)
  const [wechatLotId, setWechatLotId] = useState<string | null>(null)

  useEffect(() => {
    setCurrency(getCurrencyFromBrowser())
  }, [])

  // 检查认证
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  // 获取保证金需求信息
  // 优先使用 seller_deposit_lots 记录，如果不存在则调用 API 使用 RPC 函数检查
  const { data: depositInfo, isLoading, refetch } = useQuery({
    queryKey: ['depositInfo', user?.id],
    queryFn: async () => {
      if (!user) return null

      // 首先检查是否存在 seller_deposit_lots 记录
      const { data: depositLot } = await supabase
        .from('seller_deposit_lots')
        .select('*')
        .eq('seller_id', user.id)
        .eq('status', 'required')
        .order('required_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 如果存在 deposit lot，使用它
      if (depositLot) {
        // 获取订阅信息用于货币
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('subscription_tier, currency')
          .eq('user_id', user.id)
          .eq('subscription_type', 'seller')
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .order('subscription_tier', { ascending: false })
          .limit(1)
          .maybeSingle()

        // 获取未完成订单总额用于显示
        const { data: orders } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('seller_id', user.id)
          .eq('payment_status', 'paid')
          .in('order_status', ['pending', 'paid', 'shipped'])

        const unfilledTotal = orders?.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0) || 0

        return {
          currentTier: parseFloat(depositLot.subscription_tier_snapshot?.toString() || '0'),
          unfilledTotal,
          requiredAmount: parseFloat(depositLot.required_amount),
          currency: subscription?.currency || depositLot.currency || 'USD',
          depositLot,
        }
      }

      // 如果不存在 deposit lot，调用 API 使用 RPC 函数检查
      // 这样可以包含 pending 订单（未支付的订单）
      try {
        const response = await fetch('/api/deposits/check')
        if (!response.ok) {
          throw new Error('Failed to check deposit requirement')
        }

        const apiData = await response.json()

        return {
          currentTier: apiData.currentTier || 0,
          unfilledTotal: apiData.unfilledTotal || 0,
          requiredAmount: apiData.requiredAmount || 0,
          currency: apiData.currency || 'USD',
          depositLot: apiData.depositLot,
        }
      } catch (error) {
        console.error('Error fetching deposit info from API:', error)
        
        // Fallback to old logic if API fails
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('subscription_tier, currency')
          .eq('user_id', user.id)
          .eq('subscription_type', 'seller')
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .order('subscription_tier', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { data: orders } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('seller_id', user.id)
          .eq('payment_status', 'paid')
          .in('order_status', ['pending', 'paid', 'shipped'])

        const unfilledTotal = orders?.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0) || 0
        const currentTier = subscription?.subscription_tier || 0
        const requiredAmount = Math.max(0, unfilledTotal - currentTier)

        return {
          currentTier,
          unfilledTotal,
          requiredAmount,
          currency: subscription?.currency || 'USD',
          depositLot: null,
        }
      }
    },
    enabled: !!user,
  })

  const handlePayment = async () => {
    if (!user || !depositInfo || depositInfo.requiredAmount <= 0) {
      toast({
        variant: 'destructive',
        title: t('pay.error.title') || '错误',
        description: t('pay.error.noAmount') || '没有需要支付的保证金',
      })
      return
    }

    setProcessing(true)

    try {
      const response = await fetch('/api/deposits/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: depositInfo.requiredAmount,
          currency: depositInfo.currency || 'USD',
          paymentMethod,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create payment')
      }

      const result = await response.json()

      if (result.url) {
        window.location.href = result.url
      } else if (result.paymentMethod === 'alipay' && result.formAction && result.formData) {
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = result.formAction
        Object.entries(result.formData).forEach(([k, v]) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = k
          input.value = v
          form.appendChild(input)
        })
        document.body.appendChild(form)
        form.submit()
      } else if (result.paymentMethod === 'wechat' && result.codeUrl) {
        setWechatCodeUrl(result.codeUrl)
        if (result.lotId) setWechatLotId(result.lotId)
        toast({
          variant: 'default',
          title: t('pay.success.title') || '支付已创建',
          description: t('pay.wechatQR') || '请使用微信扫码支付，支付完成后请刷新或前往成功页。',
        })
        refetch()
      } else {
        toast({
          variant: 'default',
          title: t('pay.success.title') || '支付已创建',
          description: t('pay.success.description') || '请完成支付',
        })
        refetch()
      }
    } catch (error: any) {
      console.error('Deposit payment error:', error)
      toast({
        variant: 'destructive',
        title: t('pay.error.title') || '错误',
        description: error.message || t('pay.error.failed') || '支付失败，请重试',
      })
    } finally {
      setProcessing(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (!depositInfo || depositInfo.requiredAmount <= 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">{t('pay.title') || '支付保证金'}</h1>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <Info className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t('pay.noDeposit.title') || '无需支付保证金'}</h2>
              <p className="text-muted-foreground">
                {t('pay.noDeposit.description') ||
                  '您当前的未完成订单总额未超过订阅档位，无需支付额外保证金。'}
              </p>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link href="/seller/deposit/policy" className="flex-1 min-w-[140px]">
            <Button variant="outline" className="w-full">
              {t('pay.viewPolicy') || '查看保证金政策'}
            </Button>
          </Link>
          <Link href="/seller/deposit/refund" className="flex-1 min-w-[140px]">
            <Button variant="outline" className="w-full">
              {t('refund.apply') || '申请退款'}
            </Button>
          </Link>
          <Button variant="outline" onClick={() => router.back()} className="flex-1 min-w-[140px]">
            {t('pay.back') || '返回'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">{t('pay.title') || '支付保证金'}</h1>
      </div>

      {/* 保证金信息 */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('pay.info.title') || '保证金信息'}</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('pay.info.currentTier') || '当前订阅档位'}:</span>
            <span className="font-semibold">
              {formatCurrency(depositInfo.currentTier, depositInfo.currency as Currency)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t('pay.info.unfilledTotal') || '未完成订单总额'}:
            </span>
            <span className="font-semibold">
              {formatCurrency(depositInfo.unfilledTotal, depositInfo.currency as Currency)}
            </span>
          </div>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{t('pay.info.requiredAmount') || '需要支付'}:</span>
              <span className="text-2xl font-bold text-red-600">
                {formatCurrency(depositInfo.requiredAmount, depositInfo.currency as Currency)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 提示信息 */}
      <Card className="p-6 bg-yellow-50 border-yellow-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-yellow-800">
              {t('pay.warning') ||
                '支付保证金后，您的商品销售功能将立即恢复。保证金将在订单完成后可申请退款。'}
            </p>
            <Link href="/seller/deposit/policy" className="text-sm text-yellow-700 underline mt-2 inline-block">
              {t('pay.viewPolicy') || '查看保证金政策'}
            </Link>
          </div>
        </div>
      </Card>

      {/* 支付方式选择 */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('pay.method.title') || '选择支付方式'}</h2>
        <PaymentMethodSelector selectedMethod={paymentMethod} onSelect={setPaymentMethod} />
      </Card>

      {/* 微信二维码 */}
      {wechatCodeUrl && (
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('pay.wechatQR') || '微信扫码支付'}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('pay.wechatQRDesc') || '请使用微信扫描下方二维码完成支付，支付完成后请刷新或前往成功页。'}
          </p>
          <div className="flex justify-center mb-4">
            <img
              src={getWeChatQRCodeUrl(wechatCodeUrl)}
              alt="微信支付二维码"
              className="h-48 w-48"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setWechatCodeUrl(null); setWechatLotId(null) }}>
              {t('pay.wechatQRBack') || '返回重选'}
            </Button>
            <Link href={`/seller/deposit/pay/success?lotId=${wechatLotId ?? depositInfo?.depositLot?.id ?? ''}`} className="flex-1">
              <Button className="w-full">{t('pay.success.page') || '我已支付，去成功页'}</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* 支付按钮 */}
      <div className="flex flex-wrap gap-3">
        <Link href="/seller/deposit/policy" className="flex-1 min-w-[120px]">
          <Button variant="outline" className="w-full">
            {t('pay.viewPolicy') || '查看政策'}
          </Button>
        </Link>
        <Link href="/seller/deposit/refund" className="flex-1 min-w-[120px]">
          <Button variant="outline" className="w-full">
            {t('refund.apply') || '申请退款'}
          </Button>
        </Link>
        <Button
          onClick={handlePayment}
          disabled={processing || !!wechatCodeUrl}
          className="flex-1 min-w-[120px]"
        >
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('pay.processing') || '处理中...'}
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              {t('pay.button') || '支付保证金'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
