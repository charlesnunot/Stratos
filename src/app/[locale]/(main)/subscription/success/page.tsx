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
import { useTranslations } from 'next-intl'

export default function SubscriptionSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPaymentAccountDialog, setShowPaymentAccountDialog] = useState(false)
  const [paymentAccountStatus, setPaymentAccountStatus] = useState<{
    hasAccount: boolean
    eligibility: 'eligible' | 'blocked' | 'pending_review' | null
  } | null>(null)
  const t = useTranslations('subscription')
  const tCommon = useTranslations('common')
  const tSupport = useTranslations('support')

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
            .order('created_at', { ascending: false })
            .limit(1)

          if (type) {
            query = query.eq('subscription_type', type)
          }

          const { data, error: subError } = await query.single()

          if (subError && subError.code !== 'PGRST116') {
            console.error('Error fetching subscription:', subError)
          }

          if (data) {
            setSubscription(data)
            setError(null)

            if (data.subscription_type === 'seller') {
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
          <p className="text-muted-foreground">正在处理您的订阅...</p>
        </div>
      </div>
    )
  }

  if (error && !subscription) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card className="p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">订阅处理失败</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Link href="/subscription/manage">
              <Button variant="outline">查看订阅管理</Button>
            </Link>
            <Link href={
              type === 'affiliate' ? '/subscription/affiliate' : 
              type === 'tip' ? '/subscription/tip' : 
              '/subscription/seller'
            }>
              <Button>重试</Button>
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
        <h1 className="text-3xl font-bold mb-2">订阅成功！</h1>
        <p className="text-muted-foreground mb-6">
          您的订阅已成功激活，现在可以享受所有功能了
        </p>

        {subscription && (
          <div className="mb-6 space-y-2 text-left bg-muted p-4 rounded-lg">
            <div className="flex justify-between">
              <span className="text-muted-foreground">订阅类型：</span>
              <span className="font-semibold capitalize">
                {subscription.subscription_type === 'seller' 
                  ? '卖家' 
                  : subscription.subscription_type === 'affiliate'
                  ? '带货者'
                  : subscription.subscription_type === 'tip'
                  ? '打赏功能'
                  : subscription.subscription_type}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">支付金额：</span>
              <span className="font-semibold">¥{subscription.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">到期时间：</span>
              <span className="font-semibold">
                {new Date(subscription.expires_at).toLocaleString('zh-CN')}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Link href="/subscription/manage">
            <Button>管理订阅</Button>
          </Link>
          {subscription?.subscription_type === 'seller' ? (
            <Link href="/seller/dashboard">
              <Button variant="outline">进入卖家中心</Button>
            </Link>
          ) : subscription?.subscription_type === 'affiliate' ? (
            <Link href="/affiliate/products">
              <Button variant="outline">进入带货中心</Button>
            </Link>
          ) : subscription?.subscription_type === 'tip' ? (
            <Link href="/">
              <Button variant="outline">返回首页</Button>
            </Link>
          ) : null}
        </div>
      </Card>

      {/* 卖家订阅成功后的收款账户绑定引导弹窗 */}
      {subscription?.subscription_type === 'seller' && (
        <Dialog open={showPaymentAccountDialog} onOpenChange={setShowPaymentAccountDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                </div>
                <DialogTitle>下一步：绑定收款账户</DialogTitle>
              </div>
              <DialogDescription className="text-left">
                {!paymentAccountStatus?.hasAccount ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground">
                      您还没有绑定收款账户
                    </p>
                    <p className="text-sm text-muted-foreground">
                      为了开始接收买家付款，您需要先绑定一个收款账户。完成后才能开始卖货。
                    </p>
                    <div className="bg-muted p-3 rounded-lg space-y-2">
                      <p className="text-sm font-medium">支持的收款方式：</p>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Stripe（国际信用卡）</li>
                        <li>PayPal</li>
                        <li>支付宝</li>
                        <li>微信支付</li>
                        <li>银行转账</li>
                      </ul>
                    </div>
                  </div>
                ) : paymentAccountStatus?.eligibility === 'pending_review' ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground">
                      收款账户审核中
                    </p>
                    <p className="text-sm text-muted-foreground">
                      您的收款账户正在审核中，审核完成后即可开始接收付款。
                    </p>
                  </div>
                ) : paymentAccountStatus?.eligibility === 'blocked' ? (
                  <div className="space-y-3">
                    <p className="text-base font-medium text-foreground text-red-600">
                      收款账户已禁用
                    </p>
                    <p className="text-sm text-muted-foreground">
                      您的收款账户当前不可用，请联系客服或检查账户状态。
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
                稍后设置
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
                  立即绑定收款账户
                </Button>
              </Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
