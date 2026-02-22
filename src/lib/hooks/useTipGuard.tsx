'use client'

import { useAuth } from './useAuth'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { PayoutEligibility } from '@/components/payment/PaymentAccountBanner'
import { Loader2 } from 'lucide-react'

interface UseTipGuardResult {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isAuthenticated: boolean
  isTipEnabled: boolean
  isInternalUser: boolean
  hasPaymentAccount: boolean
  allowed: boolean
  denyReason: 'not_logged_in' | 'no_subscription' | 'no_payment_account' | null
}

export function useTipGuard(): UseTipGuardResult {
  const { user, loading: authLoading } = useAuth()
  const { 
    isTipEnabled, 
    isLoading: subscriptionLoading, 
    isInternalUser, 
    internalTipEnabled,
    hasPaymentAccount: contextHasPaymentAccount,
    payoutEligibility
  } = useSubscription()

  const isAuthenticated = !!user
  
  const hasInternalPermission = isInternalUser && internalTipEnabled
  
  // 使用 SubscriptionContext 中的收款账户状态
  const hasValidPaymentAccount = !!(contextHasPaymentAccount && 
    payoutEligibility === PayoutEligibility.ELIGIBLE)
  const hasExternalPermission = isTipEnabled && hasValidPaymentAccount
  
  const allowed = !!(isAuthenticated && (hasInternalPermission || hasExternalPermission))

  return {
    user,
    loading: authLoading || subscriptionLoading,
    isAuthenticated,
    isTipEnabled,
    isInternalUser,
    hasPaymentAccount: hasValidPaymentAccount,
    allowed,
    denyReason: !allowed 
      ? !isAuthenticated ? 'not_logged_in'
        : !isTipEnabled && !hasInternalPermission ? 'no_subscription'
        : !hasValidPaymentAccount && !isInternalUser ? 'no_payment_account'
        : null
      : null
  }
}

export function TipGate({ children }: { children: React.ReactNode }) {
  const { loading, allowed } = useTipGuard()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return null
  }

  return <>{children}</>
}
