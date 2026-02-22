'use client'

import { useSubscription } from '@/lib/subscription/SubscriptionContext'

/**
 * 统一的订阅状态检查钩子
 * 现在只读 Context，不再发起请求
 * 这是 V2.3 统一鉴权系统的核心改进
 */
export function useSubscriptionStatus() {
  return useSubscription()
}

/**
 * 简化的卖家状态检查钩子
 */
export function useSellerStatus() {
  const { isSeller, isDirectSeller, isLoading, error } = useSubscription()
  
  return {
    isSeller,
    isDirectSeller,
    isLoading,
    error
  }
}

/**
 * 简化的带货状态检查钩子
 */
export function useAffiliateStatus() {
  const { isAffiliate, isLoading, error } = useSubscription()
  
  return {
    isAffiliate,
    isLoading,
    error
  }
}

/**
 * 简化的打赏状态检查钩子
 */
export function useTipStatus() {
  const { isTipEnabled, isLoading, error } = useSubscription()
  
  return {
    isTipEnabled,
    isLoading,
    error
  }
}
