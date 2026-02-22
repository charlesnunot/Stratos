'use client'

import { useAuth } from './useAuth'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { Loader2 } from 'lucide-react'

interface UseSellerTierGuardResult {
  user: ReturnType<typeof useAuth>['user']
  loading: boolean
  isSeller: boolean
  isDirectSeller: boolean
  tier: number | null
  allowed: boolean
  denyReason: 'not_seller' | 'tier_too_low' | null
}

export function useSellerTierGuard(minTier: number): UseSellerTierGuardResult {
  const { user, loading: authLoading } = useAuth()
  const { isSeller, isDirectSeller, sellerTier, isLoading: subscriptionLoading } = useSubscription()
  
  const allowed = isDirectSeller || (isSeller && (sellerTier ?? 0) >= minTier)
  
  return {
    user,
    loading: authLoading || subscriptionLoading,
    isSeller,
    isDirectSeller,
    tier: sellerTier,
    allowed,
    denyReason: !allowed
      ? !isSeller ? 'not_seller'
        : !isDirectSeller && (sellerTier ?? 0) < minTier ? 'tier_too_low'
        : null
      : null
  }
}

export function SellerTierGate({ 
  children, 
  minTier 
}: { 
  children: React.ReactNode
  minTier: number
}) {
  const { loading, allowed } = useSellerTierGuard(minTier)

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
