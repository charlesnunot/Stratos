'use client'

import { useState, useEffect } from 'react'
import { useTipGuard } from '@/lib/hooks/useTipGuard'
import { useAuth } from '@/lib/hooks/useAuth'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { useTranslations, useLocale } from 'next-intl'
import { redirect } from '@/i18n/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Gift, DollarSign, TrendingUp, History, Settings, ChevronRight, CreditCard, Loader2 } from 'lucide-react'
import { useTipStats } from '@/lib/hooks/useTipStats'
import { useTipRecords } from '@/lib/hooks/useTipRecords'
import { useTipSettings } from '@/lib/hooks/useTipSettings'
import { PayoutEligibility } from '@/components/payment/PaymentAccountBanner'
import { PaymentAccountBanner } from '@/components/payment/PaymentAccountBanner'
import { Link } from '@/i18n/navigation'

export default function TipCenterPage() {
  const { user, loading: authLoading } = useAuth()
  const { allowed, loading: guardLoading, denyReason } = useTipGuard()
  
  // ✅ 所有 useState 必须在 hooks 之前
  const [isStable, setIsStable] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    enabled: true,
    thankYouMessage: '',
  })

  useEffect(() => {
    if (!authLoading && !guardLoading) {
      const timer = setTimeout(() => setIsStable(true), 100)
      return () => clearTimeout(timer)
    } else {
      setIsStable(false)
    }
  }, [authLoading, guardLoading, allowed])
  const { hasPaymentAccount, payoutEligibility, paymentProvider } = useSubscription()
  const t = useTranslations('tipCenter')
  const tCommon = useTranslations('common')
  const tAuth = useTranslations('auth.guard')
  const locale = useLocale()

  // ✅ Hooks 必须在所有 early return 之前调用
  const { data: tipStats } = useTipStats(user?.id)
  const { data: tipRecords } = useTipRecords(user?.id)
  const { settings, isLoading: settingsLoading, updateSettings, isUpdating } = useTipSettings(allowed)

  // 加载中 - 等待所有相关数据加载完成并稳定
  if (authLoading || guardLoading || !isStable) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 权限不足
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <p className="text-muted-foreground">
          {denyReason === 'not_logged_in' && tAuth('notLoggedIn')}
          {denyReason === 'no_subscription' && tAuth('noSubscription')}
          {denyReason === 'no_payment_account' && tAuth('noPaymentAccount')}
        </p>
        {denyReason === 'no_subscription' && (
          <Button onClick={() => redirect({ href: '/subscription/tip', locale })}>
            {tAuth('goToSubscription')}
          </Button>
        )}
        {denyReason === 'no_payment_account' && (
          <Link href="/seller/payment-accounts">
            <Button>{tAuth('bindPaymentAccount')}</Button>
          </Link>
        )}
      </div>
    )
  }

  // 获取货币符号
  const getCurrencySymbol = (locale: string) => {
    return locale === 'zh' ? '¥' : '$'
  }

  // 格式化金额
  const formatAmount = (amount: number | undefined) => {
    const symbol = getCurrencySymbol(locale)
    return `${symbol}${(amount || 0).toFixed(2)}`
  }

  // 打开设置对话框
  const handleOpenSettings = () => {
    if (settings) {
      setLocalSettings({
        enabled: settings.enabled,
        thankYouMessage: settings.thankYouMessage,
      })
    }
    setShowSettingsDialog(true)
  }

  // 保存设置
  const handleSaveSettings = () => {
    updateSettings(localSettings)
    setShowSettingsDialog(false)
  }



  // 构建 PaymentAccountBanner 需要的状态
  const paymentAccountStatus = {
    hasPaymentAccount,
    paymentProvider,
    eligibility: payoutEligibility as PayoutEligibility | null,
    shouldShowBanner: true
  }

  return (
    <div className="space-y-6">
      <PaymentAccountBanner 
        status={paymentAccountStatus}
        isLoading={false}
        namespace="tipCenter"
        showWhenBound={true}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex gap-2">
          <Link href="/seller/payment-accounts">
            <Button variant="outline">
              <CreditCard className="mr-2 h-4 w-4" />
              {t('managePaymentAccount')}
            </Button>
          </Link>
          <Button variant="outline" onClick={() => redirect({ href: '/subscription/manage', locale })}>
            <Settings className="mr-2 h-4 w-4" />
            {t('manageSubscription')}
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('receivedTotal')}</p>
              <p className="text-2xl font-bold">
                {formatAmount(tipStats?.receivedTotal)}
              </p>
            </div>
            <div className="p-2 rounded-full bg-green-100">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('receivedCount', { count: tipStats?.receivedCount || 0 })}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('givenTotal')}</p>
              <p className="text-2xl font-bold">
                {formatAmount(tipStats?.givenTotal)}
              </p>
            </div>
            <div className="p-2 rounded-full bg-blue-100">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('givenCount', { count: tipStats?.givenCount || 0 })}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('totalTips')}</p>
              <p className="text-2xl font-bold">
                {(tipStats?.receivedCount || 0) + (tipStats?.givenCount || 0)}
              </p>
            </div>
            <div className="p-2 rounded-full bg-purple-100">
              <Gift className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('totalAmount')} {formatAmount((tipStats?.receivedTotal || 0) + (tipStats?.givenTotal || 0))}
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('growth')}</p>
              <p className="text-2xl font-bold">
                {(tipStats?.growthRate || 0) > 0 ? '+' : ''}{tipStats?.growthRate || 0}%
              </p>
            </div>
            <div className={`p-2 rounded-full ${(tipStats?.growthRate || 0) > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <TrendingUp className={`h-6 w-6 ${(tipStats?.growthRate || 0) > 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('vsLastMonth')}
          </p>
        </Card>
      </div>

      {/* 打赏记录 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">{t('receivedTips')}</h2>
            <Button variant="ghost" className="text-sm">
              <History className="mr-2 h-4 w-4" />
              {t('viewAll')}
            </Button>
          </div>

          {(tipRecords?.received?.length || 0) > 0 ? (
            <div className="space-y-4">
              {tipRecords?.received?.slice(0, 3).map((tip) => (
                <div key={tip.id} className="flex items-center justify-between p-3 rounded-md hover:bg-muted">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <Gift className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium">{tip.tipper?.display_name || tip.tipper?.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tip.created_at).toLocaleDateString(locale)}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium">+{formatAmount(parseFloat(tip.amount))}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('noReceivedTips')}</p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">{t('givenTips')}</h2>
            <Button variant="ghost" className="text-sm">
              <History className="mr-2 h-4 w-4" />
              {t('viewAll')}
            </Button>
          </div>

          {(tipRecords?.given?.length || 0) > 0 ? (
            <div className="space-y-4">
              {tipRecords?.given?.slice(0, 3).map((tip) => (
                <div key={tip.id} className="flex items-center justify-between p-3 rounded-md hover:bg-muted">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <Gift className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium">{tip.recipient?.display_name || tip.recipient?.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tip.created_at).toLocaleDateString(locale)}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium">-{formatAmount(parseFloat(tip.amount))}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('noGivenTips')}</p>
            </div>
          )}
        </Card>
      </div>

      {/* 设置区域 */}
      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">{t('settings')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-md hover:bg-muted">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{t('enableTips')}</p>
                <p className="text-xs text-muted-foreground">{t('enableTipsDesc')}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleOpenSettings}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* 设置对话框 */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tipSettings')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 开启/关闭打赏 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t('enableTips')}</p>
                <p className="text-sm text-muted-foreground">{t('enableTipsDesc')}</p>
              </div>
              <Switch
                checked={localSettings.enabled}
                onCheckedChange={(checked) => 
                  setLocalSettings(prev => ({ ...prev, enabled: checked }))
                }
              />
            </div>
            
            {/* 感谢语设置 */}
            <div className="space-y-2">
              <p className="font-medium">{t('thankYouMessage')}</p>
              <p className="text-sm text-muted-foreground">{t('thankYouMessageDesc')}</p>
              <Textarea
                value={localSettings.thankYouMessage}
                onChange={(e) => setLocalSettings(prev => ({ 
                  ...prev, 
                  thankYouMessage: e.target.value 
                }))}
                placeholder={t('thankYouPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleSaveSettings} disabled={isUpdating}>
              {isUpdating ? tCommon('saving') : tCommon('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}