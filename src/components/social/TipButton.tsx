'use client'

import { useState } from 'react'
import { Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { PaymentMethodSelector } from '@/components/payments/PaymentMethodSelector'
import { PayPalButton } from '@/components/payments/PayPalButton'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from '@/lib/hooks/useToast'

interface TipButtonProps {
  postId: string
  postAuthorId: string
  currentAmount: number
}

export function TipButton({
  postId,
  postAuthorId,
  currentAmount,
}: TipButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<
    'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'
  >('stripe')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const t = useTranslations('tips')
  const tCommon = useTranslations('common')

  if (!user) return null

  const handleTip = async () => {
    const tipAmount = parseFloat(amount)
    if (!tipAmount || tipAmount <= 0) {
      toast({
        variant: 'warning',
        title: '提示',
        description: t('enterValidAmount'),
      })
      return
    }

    if (user.id === postAuthorId) {
      toast({
        variant: 'warning',
        title: '提示',
        description: t('cannotTipSelf'),
      })
      return
    }

    setLoading(true)
    try {
      if (paymentMethod === 'stripe') {
        // Create Stripe checkout session for tip
        const response = await fetch('/api/payments/stripe/create-tip-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: tipAmount,
            postId: postId,
            postAuthorId: postAuthorId,
            successUrl: `${window.location.origin}?tip=success`,
            cancelUrl: window.location.href,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create checkout session')
        }

        const { url } = await response.json()
        window.location.href = url
      } else {
        // For other payment methods, create tip record with pending status
        const { error } = await supabase.from('tips').insert({
          post_id: postId,
          tipper_id: user.id,
          recipient_id: postAuthorId,
          amount: tipAmount,
          payment_method: paymentMethod,
          payment_status: 'pending',
        })

        if (error) throw error

        toast({
          variant: 'success',
          title: '成功',
          description: t('tipCreated'),
        })
        setShowModal(false)
        router.refresh()
      }
    } catch (error: any) {
      console.error('Tip error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: t('tipFailed', { error: error.message }),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setShowModal(true)}
      >
        <Coins className="h-4 w-4" />
        {t('tip')}
      </Button>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-semibold">{t('tipCreator')}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t('currentTipAmount')}: ¥{currentAmount.toFixed(2)}
            </p>

            <div className="mb-4 space-y-2">
              <label className="text-sm font-medium">{t('tipAmount')} (¥)</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder={t('enterAmount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={paymentMethod === 'paypal'}
              />
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">{t('paymentMethod')}</label>
              <PaymentMethodSelector
                selectedMethod={paymentMethod}
                onSelect={setPaymentMethod}
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
                        title: '成功',
                        description: t('tipCreated'),
                      })
                      setShowModal(false)
                      setAmount('')
                      router.refresh()
                    }}
                    onError={(error) => {
                      toast({
                        variant: 'destructive',
                        title: '错误',
                        description: t('tipFailed', { error: error.message }),
                      })
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    请输入打赏金额
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
