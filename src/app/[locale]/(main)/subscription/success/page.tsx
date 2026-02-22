'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link, useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CheckCircle, Loader2, XCircle, CreditCard, AlertCircle, MessageSquare } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { formatCurrency } from '@/lib/currency/format-currency'
import type { Currency } from '@/lib/currency/detect-currency'

export default function SubscriptionSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showPaymentAccountDialog, setShowPaymentAccountDialog] = useState(false)
  const [paymentAccountStatus, setPaymentAccountStatus] = useState<{
    hasAccount: boolean
    eligibility: 'eligible' | 'blocked' | 'pending_review' | null
  } | null>(null)
  const t = useTranslations('subscription')
  const tCommon = useTranslations('common')
  const tSupport = useTranslations('support')
  const locale = useLocale()

  const type = searchParams.get('type')

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    const checkSubscription = async () => {
      const maxRetries = 3
      const delayMs = 2000

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await new Promise((r) => setTimeout(r, delayMs))

          let query = supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })

          if (type) {
            query = query.eq('subscription_type', type)
          }

          const { data, error: subError } = await query

          if (subError && subError.code !== 'PGRST116') {
            console.error('Error fetching subscription:', subError)
          }

          if (data && data.length > 0) {
            setSubscriptions(data)
            setError(null)

            // 检查是否有卖家订阅需要显示收款账户引导
            const sellerSubscription = data.find(s => s.subscription_type === 'seller')
            if (sellerSubscription) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('payment_provider, payment_account_id, seller_payout_eligibility')
                .eq('id', user.id)
                .single()

              const hasAccount = !!(profile?.payment_provider && profile?.payment_account_id)
              const eligibility = profile?.seller_payout_eligibility as 'eligible' | 'blocked' | 'pending_review' | null

              setPaymentAccountStatus({ hasAccount, eligibility })
              if (!hasAccount || eligibility !== 'eligible') {
                setShowPaymentAccountDialog(true)
              }
            }
            setLoading(false)
            return
          }
        } catch (err: any) {
          console.error('Error checking subscription:', err)
          setError(err.message || '检查订阅状态时出错')
        }
      }

      setError('未找到订阅记录，请稍后到订阅管理查看')
      setLoading(false)
    }

    checkSubscription()
  }, [user, type, supabase, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{t('processing')}</p>
        </div>
      </div>
    )
  }

  if (error && subscriptions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card className="p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">{tCommon('error')}</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Link href="/subscription/manage">
              <Button variant="outline">{t('success.manageSubscription')}</Button>
            </Link>
            <Link href={
              type === 'affiliate' ? '/subscription/affiliate' : 
              type === 'tip' ? '/subscription/tip' : 
              '/subscription/seller'
            }>
              <Button>{tCommon('retry')}</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <Card className="p-8 text-center">
        <CheckCircle className="mx-auto h-16 w-16 text-green-600 mb-4" />
        <h1 className="text-3xl font-bold mb-2">{t('success.title')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('success.description')}
        </p>

        {subscriptions.length > 0 && (
          <div className="mb-6 space-y-4">
            {subscriptions.map((subscription, index) => (
              <div key={subscription.id} className="text-left bg-muted p-4 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('success.subscriptionType')}</span>
                  <span className="font-semibold capitalize">
                    {subscription.subscription_type === 'seller' 
                      ? t('sellerTitle') 
                      : subscription.subscription_type === 'affiliate'
                      ? t('affiliateTitle')
                      : subscription.subscription_type === 'tip'
                      ? t('tipDescription')
                      : subscription.subscription_type}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('success.paymentAmount')}</span>
                  <span className="font-semibold">
                    {formatCurrency(
                      typeof subscription.amount === 'string' 
                        ? parseFloat(subscription.amount) 
                        : subscription.amount,
                      (subscription.currency as Currency) || 'USD'
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('success.expiryDate')}</span>
                  <span className="font-semibold">
                    {new Date(subscription.expires_at).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Link href="/subscription/manage">
            <Button>{t('success.manageSubscription')}</Button>
          </Link>
          
          {subscriptions.length > 0 && (
            <div className="flex gap-2">
              {subscriptions.some(s => s.subscription_type === 'seller') && (
                <Link href="/seller/dashboard">
                  <Button variant="outline">{t('success.enterSellerCenter')}</Button>
                </Link>
              )}
              {subscriptions.some(s => s.subscription_type === 'affiliate') && (
                <Link href="/affiliate/products">
                  <Button variant="outline">{t('success.enterAffiliateCenter')}</Button>
                </Link>
              )}
              {subscriptions.some(s => s.subscription_type === 'tip') && (
                <Link href="/">
                  <Button variant="outline">{t('success.returnHome')}</Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* 卖家订阅成功后的收款账户绑定引导弹窗 */}
      {subscriptions.some(s => s.subscription_type === 'seller') && (
        <Dialog open={showPaymentAccountDialog} onOpenChange={setShowPaymentAccountDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                            <AlertCircle className="h-5 w-5 text-yellow-600" />
                          </div>
                          <DialogTitle>{t('subscription.success.paymentAccountDialog.title')}</DialogTitle>
                        </div>
              <DialogDescription className="text-left">
                {!paymentAccountStatus?.hasAccount ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground">
                          {t('subscription.success.paymentAccountDialog.noAccount.title')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('subscription.success.paymentAccountDialog.noAccount.description')}
                        </p>
                    <div className="bg-muted p-3 rounded-lg space-y-2">
                      <p className="text-sm font-medium">{t('subscription.success.paymentAccountDialog.noAccount.supportedMethods')}</p>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside break-words">
                          {Array.isArray(t.raw('subscription.success.paymentAccountDialog.noAccount.methods')) ? (
                            t.raw('subscription.success.paymentAccountDialog.noAccount.methods').map((method: string, index: number) => (
                              <li key={index} className="break-words">{method}</li>
                            ))
                          ) : (
                            <li>{t.raw('subscription.success.paymentAccountDialog.noAccount.methods')}</li>
                          )}
                      </ul>
                    </div>
                  </div>
                ) : paymentAccountStatus?.eligibility === 'pending_review' ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground">
                          {t('subscription.success.paymentAccountDialog.pendingReview.title')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('subscription.success.paymentAccountDialog.pendingReview.description')}
                        </p>
                  </div>
                ) : paymentAccountStatus?.eligibility === 'blocked' ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground text-red-600">
                          {t('subscription.success.paymentAccountDialog.blocked.title')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('subscription.success.paymentAccountDialog.blocked.description')}
                        </p>
                  </div>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                        variant="outline"
                        onClick={() => setShowPaymentAccountDialog(false)}
                      >
                        {t('subscription.success.paymentAccountDialog.later')}
                      </Button>
              <Link href="/support/tickets/create" className="flex-1 sm:flex-initial" onClick={() => setShowPaymentAccountDialog(false)}>
                <Button variant="outline" className="w-full sm:w-auto">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {tSupport('contactSupport')}
                </Button>
              </Link>
              <Link href="/seller/payment-accounts" className="flex-1 sm:flex-initial">
                <Button className="w-full sm:w-auto" onClick={() => setShowPaymentAccountDialog(false)}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {t('subscription.success.paymentAccountDialog.bindNow')}
                </Button>
              </Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
