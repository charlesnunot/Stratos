'use client'

import { Card } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Clock, X, ChevronRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export enum PayoutEligibility {
  ELIGIBLE = 'eligible',
  BLOCKED = 'blocked',
  PENDING_REVIEW = 'pending_review',
}

export interface PaymentAccountStatus {
  hasPaymentAccount: boolean
  paymentProvider: string | null
  eligibility: PayoutEligibility | null
  shouldShowBanner?: boolean
}

interface PaymentAccountBannerProps {
  status: PaymentAccountStatus | null | undefined
  isLoading: boolean
  namespace: 'seller' | 'affiliate' | 'tipCenter'
  showWhenBound?: boolean // 是否在已绑定时也显示（默认true）
}

export function PaymentAccountBanner({ 
  status, 
  isLoading, 
  namespace,
  showWhenBound = true 
}: PaymentAccountBannerProps) {
  const t = useTranslations(namespace)
  
  // 加载中或不显示时不渲染
  if (isLoading || !status) return null
  if (status.shouldShowBanner === false) return null
  
  // 已绑定且正常，且不需要显示时
  if (!showWhenBound && status.hasPaymentAccount && status.eligibility === PayoutEligibility.ELIGIBLE) {
    return null
  }

  // 未绑定收款账户
  if (!status.hasPaymentAccount) {
    return (
      <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
        <Link href="/seller/payment-accounts">
          <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-yellow-900">
                🟡 {t('paymentAccountNotBound')}
              </p>
              <p className="text-xs text-yellow-700">
                {t('paymentAccountNotBoundDesc')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          </div>
        </Link>
      </Card>
    )
  }

  // 收款账户被封禁
  if (status.eligibility === PayoutEligibility.BLOCKED) {
    return (
      <Card className="border-2 border-red-500 bg-red-50 mb-6">
        <Link href="/seller/payment-accounts">
          <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
            <X className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-900">
                🔴 {t('paymentAccountBlocked')}
              </p>
              <p className="text-xs text-red-700">
                {t('paymentAccountBlockedDesc')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-red-600 flex-shrink-0" />
          </div>
        </Link>
      </Card>
    )
  }

  // 收款账户审核中
  if (status.eligibility === PayoutEligibility.PENDING_REVIEW) {
    return (
      <Card className="border-2 border-yellow-500 bg-yellow-50 mb-6">
        <Link href="/seller/payment-accounts">
          <div className="flex items-center gap-3 p-4 hover:opacity-90 transition-opacity cursor-pointer">
            <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-yellow-900">
                🟡 {t('paymentAccountPending')}
              </p>
              <p className="text-xs text-yellow-700">
                {t('paymentAccountPendingDesc')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          </div>
        </Link>
      </Card>
    )
  }

  // 已绑定且正常
  return (
    <Card className="border-2 border-green-500 bg-green-50 mb-6">
      <div className="flex items-center gap-3 p-4">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-900">
            🟢 {t('paymentAccountActive')}
          </p>
          <p className="text-xs text-green-700">
            {t('paymentAccountActiveDesc')}
          </p>
        </div>
      </div>
    </Card>
  )
}