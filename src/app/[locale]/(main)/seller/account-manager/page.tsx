'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, UserCircle, Mail, Phone, Clock, Calendar } from 'lucide-react'
import { Link, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from '@/lib/hooks/useToast'

interface AccountManager {
  manager_id: string
  name: string
  email: string
  phone?: string
  avatar_url?: string
  title?: string
  working_hours?: string
  languages?: string[]
  assigned_at: string
  last_contact_at?: string
  notes?: string
}

export default function SellerAccountManagerPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const { toast } = useToast()

  const [subscriptionTier, setSubscriptionTier] = useState(0)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!user) return

    const checkAccess = async () => {
      // 检查是否是直营卖家
      const { data: profile } = await supabase
        .from('profiles')
        .select('seller_type')
        .eq('id', user.id)
        .single()

      if (profile?.seller_type === 'direct') {
        setSubscriptionTier(100)
        setIsChecking(false)
        return
      }

      // 检查订阅档位
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('subscription_tier')
        .eq('user_id', user.id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .single()

      const tier = subscription?.subscription_tier || 0
      setSubscriptionTier(tier)

      // Scale 以下重定向
      if (tier < 100) {
        router.push('/seller/dashboard')
      }

      setIsChecking(false)
    }

    checkAccess()
  }, [user, supabase, router])

  // 获取客户经理信息
  const { data: managerInfo, isLoading } = useQuery({
    queryKey: ['account-manager', user?.id],
    queryFn: async () => {
      if (!user) return null

      const { data, error } = await supabase
        .from('seller_account_manager_view')
        .select('*')
        .eq('seller_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching account manager:', error)
      }

      return data as AccountManager | null
    },
    enabled: !!user && subscriptionTier >= 100,
  })

  if (authLoading || isChecking) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  // 无权限访问
  if (subscriptionTier < 100) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">专属客户经理</h1>
        <Link href="/seller/dashboard">
          <Button variant="outline">{tCommon('back')}</Button>
        </Link>
      </div>

      {isLoading ? (
        <Card className="p-6">
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </Card>
      ) : managerInfo?.manager_id ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              {managerInfo.avatar_url ? (
                <img
                  src={managerInfo.avatar_url}
                  alt={managerInfo.name}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCircle className="h-12 w-12 text-primary" />
                </div>
              )}
              <div>
                <CardTitle>{managerInfo.name}</CardTitle>
                <CardDescription>{managerInfo.title || '客户经理'}</CardDescription>
                <Badge variant="secondary" className="mt-2">Scale 档位专属</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${managerInfo.email}`} className="text-sm hover:underline">
                  {managerInfo.email}
                </a>
              </div>
              {managerInfo.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${managerInfo.phone}`} className="text-sm hover:underline">
                    {managerInfo.phone}
                  </a>
                </div>
              )}
              {managerInfo.working_hours && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{managerInfo.working_hours}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  分配时间: {new Date(managerInfo.assigned_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>

            {managerInfo.languages && managerInfo.languages.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">支持语言</p>
                <div className="flex gap-2">
                  {managerInfo.languages.map((lang) => (
                    <Badge key={lang} variant="outline">{lang}</Badge>
                  ))}
                </div>
              </div>
            )}

            {managerInfo.notes && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">备注</p>
                <p className="text-sm text-muted-foreground">{managerInfo.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="text-center py-8">
            <UserCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无专属客户经理</h3>
            <p className="text-sm text-muted-foreground mb-4">
              系统正在为您分配专属客户经理，请稍后再查看。
            </p>
            <p className="text-xs text-muted-foreground">
              作为 Scale 档位卖家，您将享有一对一的客户经理服务。
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
