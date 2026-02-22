'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, Info, Shield, CreditCard, RefreshCw, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export default function DepositPolicyPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const t = useTranslations('deposit')

  // 检查认证
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  const { data: profile } = useQuery({
    queryKey: ['profile-seller-type', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase.from('profiles').select('seller_type').eq('id', user.id).single()
      return data as { seller_type?: string } | null
    },
    enabled: !!user,
  })
  useEffect(() => {
    if (!user || !profile) return
    if ((profile as { seller_type?: string })?.seller_type === 'direct') {
      router.replace('/seller/dashboard')
    }
  }, [user, profile, router])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (profile && (profile as { seller_type?: string })?.seller_type === 'direct') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">{t('policy.title') || '保证金政策'}</h1>
      </div>

      {/* 保证金作用 */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <Shield className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-semibold">{t('policy.purpose.title') || '保证金的作用'}</h2>
            <p className="text-muted-foreground">
              {t('policy.purpose.content') ||
                '保证金是平台为保障买家权益而设立的制度。当卖家未完成订单总额超过其订阅档位提供的免费保证金额度时，需要支付额外保证金，确保卖家能够履行订单承诺。'}
            </p>
          </div>
        </div>
      </Card>

      {/* 订阅档位与免费保证金额度 */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <CreditCard className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-semibold">
              {t('policy.subscription.title') || '订阅档位与免费保证金额度'}
            </h2>
            <p className="mb-4 text-muted-foreground">
              {t('policy.subscription.content') ||
                '您的订阅费用等于免费保证金额度。订阅档位越高，免费保证金额度越高，可以支持更多的未完成订单。'}
            </p>
            <div className="rounded-lg bg-muted p-4">
              <p className="font-semibold mb-2">{t('policy.subscription.tiers')}</p>
              <p className="text-sm whitespace-pre-line">{t('policy.subscription.tierList')}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* 保证金触发条件 */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
          </div>
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-semibold">
              {t('policy.trigger.title') || '保证金触发条件'}
            </h2>
            <p className="mb-4 text-muted-foreground">
              {t('policy.trigger.content') ||
                '当您的未完成订单总额（已支付但未完成/已发货/待发货的订单）超过您当前订阅档位提供的免费保证金额度时，系统会要求您支付额外保证金。'}
            </p>
            <div className="rounded-lg bg-muted p-4">
              <p className="font-semibold mb-2">{t('policy.trigger.formula') || '计算公式：'}</p>
              <p className="text-sm font-mono">
                {t('policy.trigger.formulaDetail') ||
                  '所需保证金 = 未完成订单总额 - 订阅档位（免费保证金额度）'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 保证金状态说明 */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
            <Info className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-semibold">
              {t('policy.status.title') || '保证金状态说明'}
            </h2>
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm mb-1">
                  {t('policy.status.required') || 'required（需要支付）'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('policy.status.requiredDesc') ||
                    '系统已检测到您需要支付保证金，请尽快完成支付以恢复商品销售功能。'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">
                  {t('policy.status.held') || 'held（已支付并持有）'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('policy.status.heldDesc') ||
                    '保证金已支付并持有，您的商品销售功能已恢复。'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">
                  {t('policy.status.refundable') || 'refundable（可退款）'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('policy.status.refundableDesc') ||
                    '订单完成后3个工作日，保证金可申请退款。'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">
                  {t('policy.status.refunding') || 'refunding（退款中）'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('policy.status.refundingDesc') || '您的退款申请正在处理中。'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">
                  {t('policy.status.refunded') || 'refunded（已退款）'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('policy.status.refundedDesc') || '保证金已成功退还到您的账户。'}
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">
                  {t('policy.status.forfeited') || 'forfeited（已没收）'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('policy.status.forfeitedDesc') ||
                    '保证金已用于赔偿买家，通常发生在订单纠纷且卖家责任的情况下。'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 保证金退款规则 */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <RefreshCw className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-semibold">
              {t('policy.refund.title') || '保证金退款规则'}
            </h2>
            <p className="mb-4 text-muted-foreground">
              {t('policy.refund.content') ||
                '当您的未完成订单总额降至订阅档位以下，且所有相关订单已完成（状态为 completed 或已退款）后，保证金将在3个工作日后变为可退款状态。'}
            </p>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm">
                {t('policy.refund.note') ||
                  '退款将扣除支付渠道的手续费，实际到账金额可能略低于原始保证金金额。'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 订阅升级建议 */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <CreditCard className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="mb-2 text-xl font-semibold">
              {t('policy.upgrade.title') || '订阅升级建议'}
            </h2>
            <p className="mb-4 text-muted-foreground">
              {t('policy.upgrade.content') ||
                '如果您经常需要支付额外保证金，建议考虑升级到更高的订阅档位。更高的订阅档位提供更大的免费保证金额度，可以减少额外保证金的支付频率。'}
            </p>
            <Link href="/subscription/seller">
              <Button>{t('policy.upgrade.button') || '查看订阅档位'}</Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-3">
        <Link href="/seller/deposit/pay" className="flex-1 min-w-[140px]">
          <Button className="w-full">{t('policy.payButton') || '前往支付保证金'}</Button>
        </Link>
        <Link href="/seller/deposit/refund" className="flex-1 min-w-[140px]">
          <Button variant="outline" className="w-full">{t('refund.apply') || '申请退款'}</Button>
        </Link>
        <Button variant="outline" onClick={() => router.back()} className="flex-1 min-w-[140px]">
          {t('policy.backButton') || '返回'}
        </Button>
      </div>
    </div>
  )
}
