'use client'

import { useState, useMemo, useEffect } from 'react'
import { Gift, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useToast } from '@/lib/hooks/useToast'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getCurrencyFromBrowser, detectCurrency, type Currency } from '@/lib/currency/detect-currency'

interface TipButtonProps {
  postId: string
  postAuthorId: string
  currentAmount: number
  enabled?: boolean
  reasonDisabled?: string
  authorizationToken?: string | null
}

export function TipButton({
  postId,
  postAuthorId,
  currentAmount,
  enabled = true,
  reasonDisabled,
  authorizationToken,
}: TipButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal'>('stripe')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const isAuthor = user?.id === postAuthorId
  
  // 获取帖子作者的资料（不是当前用户的资料）
  const { data: authorProfileResult, isLoading: authorProfileLoading } = useProfile(postAuthorId)
  const authorProfile = authorProfileResult ?? null
  const router = useRouter()
  const { toast } = useToast()
  const t = useTranslations('tips')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const supabase = useMemo(() => createClient(), [])

  const [currency, setCurrency] = useState<Currency>('CNY')

  const currencySymbol = currency === 'CNY' ? '¥' : '$'

  const MAX_TIP_AMOUNTS: Record<Currency, number> = {
    CNY: 35,
    USD: 5,
    EUR: 5,
    GBP: 4,
    JPY: 700,
    KRW: 6500,
    SGD: 7,
    HKD: 40,
    AUD: 8,
    CAD: 7,
  }
  const maxTipAmount = MAX_TIP_AMOUNTS[currency] || 35

  useEffect(() => {
    if (locale === 'zh') {
      setCurrency('CNY')
    } else {
      setCurrency('USD')
    }
  }, [locale])

  // 获取帖子作者的收款账户
  const { data: authorPaymentAccounts, isLoading: authorPaymentAccountsLoading } = useQuery({
    queryKey: ['authorPaymentAccounts', postAuthorId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${postAuthorId}/payment-accounts`)
      if (!response.ok) {
        console.error('[TipButton] Failed to fetch payment accounts:', response.status)
        return { paymentAccounts: [] }
      }
      return response.json()
    },
    enabled: enabled,
  })

  // 获取收款方信息（平台 vs 用户直达）
  const { data: paymentDestination, isLoading: paymentDestinationLoading } = useQuery({
    queryKey: ['paymentDestination', postAuthorId],
    queryFn: async () => {
      const response = await fetch(`/api/payments/destination?recipientId=${postAuthorId}&context=tip`)
      if (!response.ok) {
        console.error('[TipButton] Failed to fetch payment destination:', response.status)
        return null
      }
      return response.json()
    },
    enabled: enabled,
  })

  // 根据作者收款账户确定可用支付方式
  // 加载完成前不设置默认值，确保显示正确的支付方式
  const authorPaymentTypes = authorPaymentAccounts?.paymentAccounts?.map((p: { type: string }) => p.type) || []
  
  // 结合 paymentDestination 显示正确的支付选项
  // 如果是外部用户且无收款账户，显示提示
  // 如果是内部用户或外部用户有收款账户，显示对应的支付方式
  const isExternalUserNoPayment = paymentDestination && !paymentDestination.isInternal && !paymentDestination.destinationAccountId
  const availablePaymentMethods: ('stripe' | 'paypal')[] = 
    paymentDestinationLoading 
      ? []
      : isExternalUserNoPayment
        ? []
        : authorPaymentTypes.length > 0 
          ? authorPaymentTypes.filter((t: string) => t === 'stripe' || t === 'paypal') as ('stripe' | 'paypal')[]
          : []

  // 检查帖子作者的打赏订阅是否过期
  const { data: tipSubscription } = useQuery({
    queryKey: ['tipSubscription', postAuthorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('expires_at')
        .eq('user_id', postAuthorId)
        .eq('subscription_type', 'tip')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .single()
      
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!authorProfile?.tip_enabled,
  })

  // MCRE: 打赏按钮只检查帖子级别开关，不检查作者 profile
  // 接收者能力验证在后端 create-tip-session 进行
  const tipEnabled = enabled

  // 页面级能力关闭时，展示禁用态按钮，悬停显示原因
  if (!enabled) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled
        title={reasonDisabled}
      >
        <Gift className="h-4 w-4" />
        {t('tip')}
      </Button>
    )
  }

  // 未登录用户显示"登录后打赏"按钮
  if (!user) {
    return (
      <Button variant="outline" size="sm" className="gap-2" asChild>
        <Link href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}>
          <Gift className="h-4 w-4" />
          {t('tip') || '打赏'}
        </Link>
      </Button>
    )
  }

  // MCRE: 打赏按钮只检查帖子级别开关，后端会验证作者收款能力

  const handleTip = async () => {
    const tipAmount = parseFloat(amount)
    if (!tipAmount || tipAmount <= 0) {
      toast({
        variant: 'warning',
        title: tCommon('notice'),
        description: t('enterValidAmount'),
      })
      return
    }
    if (tipAmount > maxTipAmount) {
      toast({
        variant: 'warning',
        title: tCommon('notice'),
        description: t('maximumTipAmount'),
      })
      return
    }

    if (user.id === postAuthorId) {
      toast({
        variant: 'warning',
        title: tCommon('notice'),
        description: t('cannotTipSelf'),
      })
      return
    }

    setLoading(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 18000)
      const response = await fetch('/api/payments/stripe/create-tip-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: tipAmount,
          postId,
          postAuthorId,
          successUrl: `${window.location.origin}?tip=success`,
          cancelUrl: window.location.href,
          currency: currency,
          monetizationToken: authorizationToken,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const err = await response.json()
        const errorMessage = err.error || 'Failed to create checkout session'
        
        // Map error types to i18n keys
        let userFriendlyMessage = errorMessage
        if (errorMessage.includes('subscription')) {
          userFriendlyMessage = t('tipSubscriptionExpired')
        } else if (errorMessage.includes('Tip feature subscription required')) {
          userFriendlyMessage = t('tipSubscriptionRequired')
        } else if (errorMessage.includes('Tip subscription expired')) {
          userFriendlyMessage = t('tipSubscriptionExpired')
        } else if (errorMessage.includes('Cannot tip yourself')) {
          userFriendlyMessage = t('cannotTipSelf')
        } else if (errorMessage.includes('Tip limit exceeded')) {
          userFriendlyMessage = t('tipLimitExceeded')
        }
        
        throw new Error(userFriendlyMessage)
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      console.error('Tip error:', error)
      const isAbort = error?.name === 'AbortError'
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: isAbort ? t('requestTimeoutRetry') : t('tipFailed', { error: error.message }),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setShowModal(true)}
      >
        <Gift className="h-4 w-4" />
        {t('tip')}
      </Button>
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false)
            }
          }}
        >
          <Card className="w-full max-w-md p-6 relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-6 w-6"
              onClick={() => setShowModal(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <h3 className="mb-4 text-lg font-semibold pr-8">{t('tipCreator')}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t('currentTipAmount')}: {currencySymbol}{currentAmount.toFixed(2)}
            </p>

            <div className="mb-4 space-y-2">
              <label className="text-sm font-medium">{t('tipAmount')} ({currencySymbol})</label>
              <Input
                type="number"
                min="0.01"
                max={maxTipAmount}
                step="0.01"
                placeholder={t('enterAmount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('minimumTipAmount', { symbol: currencySymbol, min: '0.01' })} · {t('maximumTipAmount', { symbol: currencySymbol, max: maxTipAmount })}</p>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">{t('paymentMethod')}</label>
              {paymentDestinationLoading || authorPaymentAccountsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></span>
                  {tCommon('loading')}
                </div>
              ) : isExternalUserNoPayment ? (
                <p className="text-sm text-destructive">
                  {t('noPaymentMethodsAvailable') || '作者暂未绑定收款方式，无法接收打赏'}
                </p>
              ) : availablePaymentMethods.length === 0 ? (
                <p className="text-sm text-destructive">
                  {t('noPaymentMethodsAvailable') || '作者暂未绑定收款方式'}
                </p>
              ) : (
                <PaymentMethodSelector
                  selectedMethod={paymentMethod}
                  onSelect={(method) => {
                    if (method === 'stripe' || method === 'paypal') setPaymentMethod(method)
                  }}
                  availableMethods={availablePaymentMethods}
                />
              )}
            </div>

            {paymentMethod === 'paypal' ? (
              <div className="space-y-4">
                {amount && parseFloat(amount) > 0 ? (
                  <PayPalButton
                    amount={parseFloat(amount)}
                    currency={currency}
                    metadata={{
                      type: 'tip',
                      postId: postId,
                      postAuthorId: postAuthorId,
                    }}
                    onSuccess={() => {
                      toast({
                        variant: 'success',
                        title: tCommon('success'),
                        description: t('tipCreated'),
                      })
                      setShowModal(false)
                      setAmount('')
                      router.refresh()
                    }}
                    onError={(error) => {
                      toast({
                        variant: 'destructive',
                        title: tCommon('error'),
                        description: t('tipFailed', { error: error.message }),
                      })
                    }}
                  />
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  className="w-full"
                >
                  {tCommon('cancel')}
                </Button>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                >
                  {tCommon('cancel')}
                </Button>
                <Button onClick={handleTip} disabled={loading || !amount}>
                  {loading ? t('processing') : t('confirmTip')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
