'use client'

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { getSupabaseClient, recreateSupabaseClient } from '@/lib/supabase/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

interface SubscriptionState {
  // 卖家订阅状态
  isSeller: boolean
  isDirectSeller: boolean
  sellerTier: number | null
  sellerExpiresAt: string | null
  
  // 带货订阅状态
  isAffiliate: boolean
  affiliateExpiresAt: string | null
  
  // 打赏订阅状态
  isTipEnabled: boolean
  tipExpiresAt: string | null
  
  // 内部用户权限
  isInternalUser: boolean
  internalTipEnabled: boolean
  internalAffiliateEnabled: boolean
  
  // 收款账户状态
  hasPaymentAccount: boolean
  paymentProvider: string | null
  payoutEligibility: string | null
  
  // 加载状态
  isLoading: boolean
  error: Error | null
}

const SubscriptionContext = createContext<SubscriptionState | null>(null)

// 初始空状态（用于用户切换时重置）
const EMPTY_STATE: SubscriptionState = {
  isSeller: false,
  isDirectSeller: false,
  sellerTier: null,
  sellerExpiresAt: null,
  isAffiliate: false,
  affiliateExpiresAt: null,
  isTipEnabled: false,
  tipExpiresAt: null,
  isInternalUser: false,
  internalTipEnabled: false,
  internalAffiliateEnabled: false,
  hasPaymentAccount: false,
  paymentProvider: null,
  payoutEligibility: null,
  isLoading: true,
  error: null
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState<SubscriptionState>(EMPTY_STATE)
  const userIdRef = useRef<string | undefined>(undefined)
  const supabase = getSupabaseClient()

  // 🚨 Fix 1: 用户变化立即 Reset Authorization
  // 防止 Stale Authorization Window
  useEffect(() => {
    if (user?.id !== userIdRef.current) {
      setState({
        ...EMPTY_STATE,
        isLoading: !!user  // 如果有新用户，保持 loading；如果登出，结束 loading
      })
      userIdRef.current = user?.id
    }
  }, [user?.id])

  // 🚨 Fix 2: Cancel In-Flight Fetch
  // 防止慢网络下的 Fetch Pollution
  const fetchSubscriptionStatus = useCallback(async () => {
    if (!user) return

    let cancelled = false

    try {
      // 先获取当前 session，确保使用最新 JWT
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        if (!cancelled) {
          setState(EMPTY_STATE)
        }
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          seller_type,
          seller_subscription_active,
          seller_subscription_expires_at,
          seller_subscription_tier,
          affiliate_subscription_active,
          affiliate_subscription_expires_at,
          tip_enabled,
          tip_subscription_active,
          tip_subscription_expires_at,
          subscription_type,
          subscription_expires_at,
          user_origin,
          internal_tip_enabled,
          internal_affiliate_enabled,
          payment_provider,
          payment_account_id,
          seller_payout_eligibility
        `)
        .eq('id', session.user.id)
        .single()

      // 如果已经取消，丢弃结果
      if (cancelled) return

      if (error) throw error

      // 计算订阅状态
      const isDirectSeller = profile?.seller_type === 'direct'
      
      let isSeller = profile?.seller_subscription_active === true
      if (!isSeller && profile?.subscription_type === 'seller') {
        const hasValidExpiry = profile?.subscription_expires_at && 
          new Date(profile.subscription_expires_at) > new Date()
        isSeller = hasValidExpiry
      }
      
      const isInternalUser = profile?.user_origin === 'internal'
      
      const hasInternalAffiliate = profile?.internal_affiliate_enabled === true
      const hasAffiliateSubscription = profile?.affiliate_subscription_active === true
      let isAffiliate = isInternalUser ? 
        (hasInternalAffiliate || hasAffiliateSubscription) : 
        hasAffiliateSubscription
      
      if (!isAffiliate && profile?.subscription_type === 'affiliate') {
        const hasValidExpiry = profile?.subscription_expires_at && 
          new Date(profile.subscription_expires_at) > new Date()
        isAffiliate = hasValidExpiry
      }
      
      const hasInternalTip = profile?.internal_tip_enabled === true
      const hasTipSubscription = profile?.tip_subscription_active === true
      const isTipEnabled = isInternalUser ? 
        (hasInternalTip || hasTipSubscription) : 
        hasTipSubscription

      // 再次检查是否已取消
      if (cancelled) return

      // 计算收款账户状态
      const hasPaymentAccount = !!(profile?.payment_provider && profile?.payment_account_id)

      setState({
        isSeller: isDirectSeller || isSeller,
        isDirectSeller,
        sellerTier: profile?.seller_subscription_tier ? parseFloat(profile.seller_subscription_tier) : null,
        sellerExpiresAt: profile?.seller_subscription_expires_at || profile?.subscription_expires_at || null,
        isAffiliate,
        affiliateExpiresAt: profile?.affiliate_subscription_expires_at || null,
        isTipEnabled,
        tipExpiresAt: profile?.tip_subscription_expires_at || null,
        isInternalUser,
        internalTipEnabled: hasInternalTip,
        internalAffiliateEnabled: hasInternalAffiliate,
        hasPaymentAccount,
        paymentProvider: profile?.payment_provider || null,
        payoutEligibility: profile?.seller_payout_eligibility || null,
        isLoading: false,
        error: null
      })
    } catch (err) {
      if (cancelled) return
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch subscription status')
      }))
    }

    return () => {
      cancelled = true
    }
  }, [user?.id, supabase])

  // 主要的订阅状态获取逻辑
  useEffect(() => {
    // 等待认证状态确定
    if (authLoading) return

    // 🚨 添加：session 过期处理
    if (!user && !authLoading) {
      setState(EMPTY_STATE)
      return
    }

    // 未登录用户 - 已经在上面的 reset 中处理
    if (!user) return

    fetchSubscriptionStatus()

    // 🚨 Fix 3: 监听 TOKEN_REFRESHED（Session-Bound 版本）
    // 防止 Webhook 成功后 UI 永远不更新
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event !== 'TOKEN_REFRESHED') return

        // 🚨 关键安全检查：验证 token 刷新属于当前 session
        if (!session?.user?.id) return
        if (session.user.id !== userIdRef.current) return

        // 只有当前用户的 token 刷新才重新获取权限
        fetchSubscriptionStatus()
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [user?.id, authLoading, fetchSubscriptionStatus, supabase])

  // 🚨 Fix 4: 监听 Realtime 订阅更新事件
  useEffect(() => {
    if (!user) return

    // 🚨 先清理所有旧 channel，防止多标签页残留
    supabase.removeAllChannels()

    // 订阅新的 Realtime 频道
    const channel = supabase
      .channel(`user:${user.id}`)
      .on('broadcast', { event: 'subscription_updated' }, async (payload: { payload: Record<string, unknown> }) => {
        console.log('[SubscriptionContext] Received subscription_updated event:', payload)
        
        try {
          // 🚨 Step 1: 刷新 Session 获取新 JWT
          const { error: refreshError } = await supabase.auth.refreshSession()
          
          if (refreshError) {
            console.error('[SubscriptionContext] Failed to refresh session:', refreshError)
            return
          }
          
          console.log('[SubscriptionContext] Session refreshed successfully')
          
          // 🚨 Step 2: 断开所有 Realtime 连接
          await supabase.removeAllChannels()
          
          // 🚨 Step 3: 重建 Supabase Client（关键！）
          // 必须重建 client 来强制 drop HTTP keep-alive connection pool
          // 否则 PostgREST 会继续使用旧的 Authorization Context
          const newSupabase = recreateSupabaseClient()
          
          console.log('[SubscriptionContext] Supabase client recreated')
          
          // Step 4: 重新获取订阅状态
          // 使用新的 client 获取最新数据
          const { data: { session } } = await newSupabase.auth.getSession()
          
          if (session?.user?.id === userIdRef.current) {
            // 重新获取订阅状态
            const { data: profile } = await newSupabase
              .from('profiles')
              .select(`
                seller_type,
                seller_subscription_active,
                seller_subscription_expires_at,
                seller_subscription_tier,
                affiliate_subscription_active,
                affiliate_subscription_expires_at,
                tip_enabled,
                tip_subscription_active,
                tip_subscription_expires_at,
                subscription_type,
                subscription_expires_at,
                user_origin,
                internal_tip_enabled,
                internal_affiliate_enabled,
                payment_provider,
                payment_account_id,
                seller_payout_eligibility
              `)
              .eq('id', session.user.id)
              .single()

            if (profile) {
              const isDirectSeller = profile?.seller_type === 'direct'
              let isSeller = profile?.seller_subscription_active === true
              if (!isSeller && profile?.subscription_type === 'seller') {
                const hasValidExpiry = profile?.subscription_expires_at && 
                  new Date(profile.subscription_expires_at) > new Date()
                isSeller = hasValidExpiry
              }
              
              const isInternalUser = profile?.user_origin === 'internal'
              const hasInternalAffiliate = profile?.internal_affiliate_enabled === true
              const hasAffiliateSubscription = profile?.affiliate_subscription_active === true
              let isAffiliate = isInternalUser ? 
                (hasInternalAffiliate || hasAffiliateSubscription) : 
                hasAffiliateSubscription
              
              const hasInternalTip = profile?.internal_tip_enabled === true
              const hasTipSubscription = profile?.tip_subscription_active === true
              const isTipEnabled = isInternalUser ? 
                (hasInternalTip || hasTipSubscription) : 
                hasTipSubscription
              
              const hasPaymentAccount = !!(profile?.payment_provider && profile?.payment_account_id)

              setState({
                isSeller: isDirectSeller || isSeller,
                isDirectSeller,
                sellerTier: profile?.seller_subscription_tier ? parseFloat(profile.seller_subscription_tier) : null,
                sellerExpiresAt: profile?.seller_subscription_expires_at || profile?.subscription_expires_at || null,
                isAffiliate,
                affiliateExpiresAt: profile?.affiliate_subscription_expires_at || null,
                isTipEnabled,
                tipExpiresAt: profile?.tip_subscription_expires_at || null,
                isInternalUser,
                internalTipEnabled: hasInternalTip,
                internalAffiliateEnabled: hasInternalAffiliate,
                hasPaymentAccount,
                paymentProvider: profile?.payment_provider || null,
                payoutEligibility: profile?.seller_payout_eligibility || null,
                isLoading: false,
                error: null
              })
              
              console.log('[SubscriptionContext] Subscription state updated after realtime event')
            }
          }
        } catch (error) {
          console.error('[SubscriptionContext] Error handling subscription update:', error)
        }
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [user?.id, supabase])

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider')
  }
  return context
}
