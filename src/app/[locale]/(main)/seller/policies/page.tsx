'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter, usePathname } from '@/i18n/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { showSuccess, showError, showInfo } from '@/lib/utils/toast'

export default function SellerPoliciesPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const tProducts = useTranslations('products')

  const [returnPolicy, setReturnPolicy] = useState('')
  const [exchangePolicy, setExchangePolicy] = useState('')
  const [shippingPolicy, setShippingPolicy] = useState('')
  const [contactInfo, setContactInfo] = useState('')

  // 检查认证
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  // 获取当前卖家政策
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['sellerProfile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('return_policy, exchange_policy, shipping_policy, contact_info')
        .eq('id', user.id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // 更新表单数据
  useEffect(() => {
    if (profile) {
      setReturnPolicy(profile.return_policy || '')
      setExchangePolicy(profile.exchange_policy || '')
      setShippingPolicy(profile.shipping_policy || '')
      setContactInfo(profile.contact_info || '')
    }
  }, [profile])

  // 保存政策
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('profiles')
        .update({
          return_policy: returnPolicy.trim() || null,
          exchange_policy: exchangePolicy.trim() || null,
          shipping_policy: shippingPolicy.trim() || null,
          contact_info: contactInfo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellerProfile', user?.id] })
      showSuccess(tCommon('saved') || '保存成功')
    },
    onError: (error: any) => {
      console.error('Save policies error:', error)
      showError(tCommon('error') || '保存失败，请重试')
    },
  })

  const handleSave = () => {
    saveMutation.mutate()
  }

  if (authLoading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('storePolicies') || 'Store Policies'}</h1>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {tCommon('saving') || '保存中...'}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {tCommon('save') || '保存'}
            </>
          )}
        </Button>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="return-policy">
            {tProducts('returnPolicy') || 'Return Policy'}
          </Label>
          <Textarea
            id="return-policy"
            placeholder={t('returnPolicyPlaceholder') || '例如：我们允许在14天内退货...'}
            value={returnPolicy}
            onChange={(e) => setReturnPolicy(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <p className="text-sm text-muted-foreground">
            {t('returnPolicyHint') || '设置您的退货政策，这将显示在您的商品页面上'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exchange-policy">
            {tProducts('exchangePolicy') || 'Exchange Policy'}
          </Label>
          <Textarea
            id="exchange-policy"
            placeholder={t('exchangePolicyPlaceholder') || '例如：我们允许在14天内换货...'}
            value={exchangePolicy}
            onChange={(e) => setExchangePolicy(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <p className="text-sm text-muted-foreground">
            {t('exchangePolicyHint') || '设置您的换货政策，这将显示在您的商品页面上'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="shipping-policy">
            {tProducts('shippingPolicy') || 'Shipping Policy'}
          </Label>
          <Textarea
            id="shipping-policy"
            placeholder={t('shippingPolicyPlaceholder') || '例如：我们通常在3-5个工作日内发货...'}
            value={shippingPolicy}
            onChange={(e) => setShippingPolicy(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <p className="text-sm text-muted-foreground">
            {t('shippingPolicyHint') || '设置您的配送政策，这将显示在您的商品页面上'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-info">
            {tProducts('contactInfo') || 'Contact Information'}
          </Label>
          <Textarea
            id="contact-info"
            placeholder={t('contactInfoPlaceholder') || '例如：如有任何问题，请联系我们...'}
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <p className="text-sm text-muted-foreground">
            {t('contactInfoHint') || '设置您的联系信息，这将显示在您的商品页面上'}
          </p>
        </div>
      </Card>
    </div>
  )
}
