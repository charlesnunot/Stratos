'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export default function SubscriptionManagePage() {
  const { user } = useAuth()
  const supabase = createClient()

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!user,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('subscription_type, subscription_expires_at')
        .eq('id', user.id)
        .single()

      return data
    },
    enabled: !!user,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isExpired =
    profile?.subscription_expires_at &&
    new Date(profile.subscription_expires_at) < new Date()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">订阅管理</h1>

      {!subscription && !profile?.subscription_type ? (
        <Card className="p-8 text-center">
          <p className="mb-4 text-muted-foreground">您还没有订阅</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/subscription/seller">
              <Button>成为卖家</Button>
            </Link>
            <Link href="/subscription/affiliate">
              <Button variant="outline">成为带货者</Button>
            </Link>
            <Link href="/subscription/tip">
              <Button variant="outline">订阅打赏功能</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">当前订阅</h2>
            {isExpired ? (
              <span className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                已过期
              </span>
            ) : subscription?.status === 'active' ? (
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                活跃
              </span>
            ) : (
              <span className="flex items-center gap-2 text-yellow-600">
                <Clock className="h-5 w-5" />
                待激活
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">订阅类型</p>
              <p className="font-semibold">
                {(() => {
                  const type = subscription?.subscription_type || profile?.subscription_type
                  if (type === 'seller') return '卖家订阅'
                  if (type === 'affiliate') return '带货者订阅'
                  if (type === 'tip') return '打赏功能订阅'
                  return type || '-'
                })()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">支付方式</p>
              <p className="font-semibold capitalize">
                {subscription?.payment_method || '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">订阅金额</p>
              <p className="font-semibold">
                ¥{subscription?.amount?.toFixed(2) || '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">到期时间</p>
              <p className="font-semibold">
                {profile?.subscription_expires_at
                  ? new Date(profile.subscription_expires_at).toLocaleString(
                      'zh-CN'
                    )
                  : '-'}
              </p>
            </div>
            {subscription && (
              <div>
                <p className="text-sm text-muted-foreground">开始时间</p>
                <p className="font-semibold">
                  {new Date(subscription.starts_at).toLocaleString('zh-CN')}
                </p>
              </div>
            )}
          </div>

          {isExpired && (
            <div className="mt-6">
              <Link href={`/subscription/${subscription?.subscription_type || 'seller'}`}>
                <Button className="w-full">续费订阅</Button>
              </Link>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
