'use client'

import { useState, useMemo } from 'react'
import { Gift, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from '@/lib/hooks/useToast'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface TipButtonProps {
  postId: string
  postAuthorId: string
  currentAmount: number
  enabled?: boolean
  reasonDisabled?: string
}

export function TipButton({
  postId,
  postAuthorId,
  currentAmount,
  enabled = true,
  reasonDisabled,
}: TipButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal'>('stripe')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { data: profileResult, isLoading: profileLoading } = useProfile(user?.id ?? '')
  const profile = profileResult?.profile
  const router = useRouter()
  const { toast } = useToast()
  const t = useTranslations('tips')
  const tCommon = useTranslations('common')
  const supabase = useMemo(() => createClient(), [])

  // 检查打赏订阅是否过期
  const { data: tipSubscription } = useQuery({
    queryKey: ['tipSubscription', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('subscriptions')
        .select('expires_at')
        .eq('user_id', user.id)
        .eq('subscription_type', 'tip')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .single()
      
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!user && !!profile?.tip_enabled,
  })

  const tipEnabled = !!profile?.tip_enabled && !!tipSubscription

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

  if (profileLoading) {
    return (
      <Button variant="outline" size="sm" className="gap-2" disabled>
        <Gift className="h-4 w-4" />
        <span className="text-xs">{t('tip')}</span>
        <span className="text-xs text-muted-foreground ml-1">{tCommon('loading')}</span>
      </Button>
    )
  }

  if (!tipEnabled) {
    return (
      <Button variant="outline" size="sm" className="gap-2" asChild>
        <Link href="/subscription/tip">
          <Gift className="h-4 w-4" />
          {t('enableTip')}
        </Link>
      </Button>
    )
  }

  const MAX_TIP_CNY = 35

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
    if (tipAmount > MAX_TIP_CNY) {
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
          currency: 'CNY',
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
              {t('currentTipAmount')}: ¥{currentAmount.toFixed(2)}
            </p>

            <div className="mb-4 space-y-2">
              <label className="text-sm font-medium">{t('tipAmount')} (¥)</label>
              <Input
                type="number"
                min="0.01"
                max="35"
                step="0.01"
                placeholder={t('enterAmount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={paymentMethod === 'paypal'}
              />
              <p className="text-xs text-muted-foreground">{t('minimumTipAmount')} · {t('maximumTipAmount')}</p>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">{t('paymentMethod')}</label>
              <PaymentMethodSelector
                selectedMethod={paymentMethod}
                onSelect={(method) => {
                  if (method === 'stripe' || method === 'paypal') setPaymentMethod(method)
                }}
                availableMethods={['stripe', 'paypal']}
              />
            </div>

            {paymentMethod === 'paypal' ? (
              <div className="space-y-4">
                {amount && parseFloat(amount) > 0 ? (
                  <PayPalButton
                    amount={parseFloat(amount)}
                    currency="CNY"
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
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    {t('enterAmount')}
                  </p>
                )}
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
