'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter, usePathname } from '@/i18n/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, XCircle, Clock, History, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function SubscriptionManagePage() {
  const t = useTranslations('subscription')
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [showHistory, setShowHistory] = useState(false)

  // Redirect to login when not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  const { data: activeSubscriptions, isLoading } = useQuery({
    queryKey: ['active-subscriptions', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      if (error && error.code !== 'PGRST116') throw error
      return data || []
    },
    enabled: !!user,
  })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['subscription-history', user?.id],
    queryFn: async () => {
      if (!user) return null
      const response = await fetch('/api/subscriptions/history')
      if (!response.ok) throw new Error('Failed to fetch subscription history')
      return response.json()
    },
    enabled: !!user && showHistory,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select(`
          subscription_type, 
          subscription_expires_at,
          seller_subscription_active,
          seller_subscription_expires_at,
          affiliate_subscription_active,
          affiliate_subscription_expires_at,
          tip_subscription_active,
          tip_subscription_expires_at
        `)
        .eq('id', user.id)
        .single()

      return data
    },
    enabled: !!user,
  })

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 检查是否有任何活跃订阅
  const hasActiveSubscriptions = activeSubscriptions && activeSubscriptions.length > 0
  
  // 检查是否有任何订阅类型在profile中活跃
  const hasActiveProfileSubscriptions = 
    profile?.seller_subscription_active || 
    profile?.affiliate_subscription_active || 
    profile?.tip_subscription_active
  
  // 检查是否有任何订阅过期
  const isAnySubscriptionExpired = 
    (profile?.seller_subscription_expires_at && new Date(profile.seller_subscription_expires_at) < new Date()) ||
    (profile?.affiliate_subscription_expires_at && new Date(profile.affiliate_subscription_expires_at) < new Date()) ||
    (profile?.tip_subscription_expires_at && new Date(profile.tip_subscription_expires_at) < new Date())

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('manageTitle')}</h1>
        <Button
          variant="outline"
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2"
        >
          <History className="h-4 w-4" />
          {showHistory ? t('hideHistory') : t('viewHistory')}
        </Button>
      </div>

      {!hasActiveSubscriptions && !hasActiveProfileSubscriptions ? (
        <Card className="p-8 text-center">
          <p className="mb-4 text-muted-foreground">{t('noSubscription')}</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/subscription/seller">
              <Button>{t('becomeSeller')}</Button>
            </Link>
            <Link href="/subscription/affiliate">
              <Button variant="outline">{t('becomeAffiliate')}</Button>
            </Link>
            <Link href="/subscription/tip">
              <Button variant="outline">{t('tipSubscription')}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* 卖家订阅 */}
          {(profile?.seller_subscription_active || activeSubscriptions?.some(s => s.subscription_type === 'seller')) && (
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t('sellerSubscription')}</h2>
                {profile?.seller_subscription_expires_at && new Date(profile.seller_subscription_expires_at) < new Date() ? (
                  <span className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    {t('expired')}
                  </span>
                ) : profile?.seller_subscription_active ? (
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    {t('active')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-yellow-600">
                    <Clock className="h-5 w-5" />
                    {t('pending')}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('subscriptionType')}</p>
                  <p className="font-semibold">{t('sellerSubscription')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('expiresAt')}</p>
                  <p className="font-semibold">
                    {profile?.seller_subscription_expires_at
                      ? new Date(profile.seller_subscription_expires_at).toLocaleString('zh-CN')
                      : '-'}
                  </p>
                </div>
              </div>

              {profile?.seller_subscription_expires_at && new Date(profile.seller_subscription_expires_at) < new Date() && (
                <div className="mt-6">
                  <Link href="/subscription/seller">
                    <Button className="w-full">{t('renewSubscription')}</Button>
                  </Link>
                </div>
              )}
            </Card>
          )}

          {/* 带货订阅 */}
          {(profile?.affiliate_subscription_active || activeSubscriptions?.some(s => s.subscription_type === 'affiliate')) && (
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t('affiliateSubscription')}</h2>
                {profile?.affiliate_subscription_expires_at && new Date(profile.affiliate_subscription_expires_at) < new Date() ? (
                  <span className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    {t('expired')}
                  </span>
                ) : profile?.affiliate_subscription_active ? (
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    {t('active')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-yellow-600">
                    <Clock className="h-5 w-5" />
                    {t('pending')}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('subscriptionType')}</p>
                  <p className="font-semibold">{t('affiliateSubscription')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('expiresAt')}</p>
                  <p className="font-semibold">
                    {profile?.affiliate_subscription_expires_at
                      ? new Date(profile.affiliate_subscription_expires_at).toLocaleString('zh-CN')
                      : '-'}
                  </p>
                </div>
              </div>

              {profile?.affiliate_subscription_expires_at && new Date(profile.affiliate_subscription_expires_at) < new Date() && (
                <div className="mt-6">
                  <Link href="/subscription/affiliate">
                    <Button className="w-full">{t('renewSubscription')}</Button>
                  </Link>
                </div>
              )}
            </Card>
          )}

          {/* 打赏订阅 */}
          {(profile?.tip_subscription_active || activeSubscriptions?.some(s => s.subscription_type === 'tip')) && (
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t('tipSubscriptionType')}</h2>
                {profile?.tip_subscription_expires_at && new Date(profile.tip_subscription_expires_at) < new Date() ? (
                  <span className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    {t('expired')}
                  </span>
                ) : profile?.tip_subscription_active ? (
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    {t('active')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-yellow-600">
                    <Clock className="h-5 w-5" />
                    {t('pending')}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('subscriptionType')}</p>
                  <p className="font-semibold">{t('tipSubscriptionType')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('expiresAt')}</p>
                  <p className="font-semibold">
                    {profile?.tip_subscription_expires_at
                      ? new Date(profile.tip_subscription_expires_at).toLocaleString('zh-CN')
                      : '-'}
                  </p>
                </div>
              </div>

              {profile?.tip_subscription_expires_at && new Date(profile.tip_subscription_expires_at) < new Date() && (
                <div className="mt-6">
                  <Link href="/subscription/tip">
                    <Button className="w-full">{t('renewSubscription')}</Button>
                  </Link>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Subscription History */}
      {showHistory && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('subscriptionHistory')}
          </h2>

          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : historyData?.stats ? (
            <>
              {/* Statistics */}
              <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">{t('totalSubscriptions')}</p>
                  <p className="text-2xl font-bold">{historyData.stats.total}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">{t('active')}</p>
                  <p className="text-2xl font-bold text-green-600">{historyData.stats.active}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">{t('expired')}</p>
                  <p className="text-2xl font-bold text-red-600">{historyData.stats.expired}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">{t('totalSpent')}</p>
                  <p className="text-2xl font-bold">
                    ¥{historyData.stats.totalSpent.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* History List */}
              {historyData.subscriptions && historyData.subscriptions.length > 0 ? (
                <div className="space-y-3">
                  {historyData.subscriptions.map((sub: any) => {
                    const isActive = sub.status === 'active' && new Date(sub.expires_at) > new Date()
                    const isExpired = sub.status === 'expired' || new Date(sub.expires_at) <= new Date()
                    
                    return (
                      <div
                        key={sub.id}
                        className="rounded-lg border p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">
                              {sub.subscription_type === 'seller' && t('sellerSubscription')}
                              {sub.subscription_type === 'affiliate' && t('affiliateSubscription')}
                              {sub.subscription_type === 'tip' && t('tipSubscriptionType')}
                              {sub.subscription_tier && ` (${t('tierLabel', { tier: sub.subscription_tier })})`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(sub.created_at).toLocaleString('zh-CN')}
                            </p>
                          </div>
                          <div className="text-right">
                            {isActive ? (
                              <span className="flex items-center gap-1 text-green-600 text-sm">
                                <CheckCircle className="h-4 w-4" />
                                {t('active')}
                              </span>
                            ) : isExpired ? (
                              <span className="flex items-center gap-1 text-red-600 text-sm">
                                <XCircle className="h-4 w-4" />
                                {t('expired')}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-yellow-600 text-sm">
                                <Clock className="h-4 w-4" />
                                {sub.status}
                              </span>
                            )}
                            <p className="text-sm font-semibold mt-1">
                              ¥{sub.amount?.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {new Date(sub.starts_at).toLocaleDateString('zh-CN')} -{' '}
                            {new Date(sub.expires_at).toLocaleDateString('zh-CN')}
                          </span>
                          <span className="capitalize">{sub.payment_method}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">{t('noHistory')}</p>
              )}
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">{t('loadFailed')}</p>
          )}
        </Card>
      )}
    </div>
  )
}
