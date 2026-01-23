'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link, useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function SubscriptionSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('subscription')
  const tCommon = useTranslations('common')

  const sessionId = searchParams.get('session_id')
  const type = searchParams.get('type')

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    if (!sessionId) {
      setError('缺少会话ID')
      setLoading(false)
      return
    }

    // 检查订阅是否已创建（通过webhook）
    const checkSubscription = async () => {
      try {
        // 等待一下，让webhook有时间处理
        await new Promise(resolve => setTimeout(resolve, 2000))

        const { data, error: subError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (subError && subError.code !== 'PGRST116') {
          console.error('Error fetching subscription:', subError)
        }

        if (data) {
          setSubscription(data)
        } else {
          // 如果webhook还没处理，显示等待消息
          setError(null)
        }
      } catch (err: any) {
        console.error('Error checking subscription:', err)
        setError(err.message || '检查订阅状态时出错')
      } finally {
        setLoading(false)
      }
    }

    checkSubscription()
  }, [user, sessionId, supabase, router])

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
    </div>
  )
}
