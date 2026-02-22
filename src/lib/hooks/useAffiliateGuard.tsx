'use client'

import { useAuth } from './useAuth'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { PayoutEligibility } from '@/components/payment/PaymentAccountBanner'
import { Loader2 } from 'lucide-react'

interface UseAffiliateGuardResult {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isAuthenticated: boolean
  isAffiliate: boolean
  isInternalUser: boolean
  hasPaymentAccount: boolean
  allowed: boolean
  denyReason: 'not_logged_in' | 'no_subscription' | 'no_payment_account' | null
}

export function useAffiliateGuard(): UseAffiliateGuardResult {
  const { user, loading: authLoading } = useAuth()
  const { 
    isAffiliate, 
    isLoading: subscriptionLoading, 
    isInternalUser, 
    internalAffiliateEnabled,
    hasPaymentAccount: contextHasPaymentAccount,
    payoutEligibility
  } = useSubscription()

  const isAuthenticated = !!user
  
  const hasInternalPermission = isInternalUser && internalAffiliateEnabled
  
  // 使用 SubscriptionContext 中的收款账户状态
  const hasValidPaymentAccount = !!(contextHasPaymentAccount && 
    payoutEligibility === PayoutEligibility.ELIGIBLE)
  const hasExternalPermission = isAffiliate && hasValidPaymentAccount
  
  const allowed = !!(isAuthenticated && (hasInternalPermission || hasExternalPermission))

  return {
    user,
    loading: authLoading || subscriptionLoading,
    isAuthenticated,
    isAffiliate,
    isInternalUser,
    hasPaymentAccount: hasValidPaymentAccount,
    allowed,
    denyReason: !allowed 
      ? !isAuthenticated ? 'not_logged_in'
        : !isAffiliate && !hasInternalPermission ? 'no_subscription'
        : !hasValidPaymentAccount && !isInternalUser ? 'no_payment_account'
        : null
      : null
  }
}

export function AffiliateGate({ children }: { children: React.ReactNode }) {
  const { loading, allowed } = useAffiliateGuard()

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
