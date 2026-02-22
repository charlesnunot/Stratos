// Cart CRDT System - React Hook
// ============================================================
// Modern hook for Causal-Stable Shopping Cart (CSSC)
// ============================================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { createClient } from '@/lib/supabase/client'
import { 
  CartSessionManager, 
  IntentEmitter, 
  generateSkuId, 
  parseSkuId 
} from '@/lib/cart'
import type { CartItemCRDT, CartItemLegacy } from '@/lib/cart/types'

interface UseCartV5Return {
  // State
  items: CartItemCRDT[]
  isLoading: boolean
  isSyncing: boolean
  
  // Actions
  addItem: (
    productId: string, 
    quantity?: number, 
    color?: string | null, 
    size?: string | null
  ) => Promise<void>
  decreaseItem: (
    productId: string, 
    quantity?: number, 
    color?: string | null, 
    size?: string | null
  ) => Promise<void>
  removeItem: (
    productId: string, 
    color?: string | null, 
    size?: string | null
  ) => Promise<void>
  clearCart: () => Promise<void>
  
  // Utilities
  getTotalQuantity: () => number
  getTotalPrice: () => number
  getItemQuantity: (skuId: string) => number
}

// Singleton instances
let sessionManager: CartSessionManager | null = null
let intentEmitter: IntentEmitter | null = null

function getCartInstances() {
  if (!sessionManager) {
    sessionManager = new CartSessionManager()
  }
  if (!intentEmitter) {
    intentEmitter = new IntentEmitter(sessionManager)
  }
  return { sessionManager, intentEmitter }
}

export function useCartV5(): UseCartV5Return {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const supabase = createClient()
  
  const [isSyncing, setIsSyncing] = useState(false)
  
  // Get cart instances
  const { sessionManager, intentEmitter } = getCartInstances()
  
  // Query for cart state
  const { data: cartState, isLoading } = useQuery<CartItemCRDT[]>({
    queryKey: ['cart', user?.id],
    queryFn: async () => {
      if (!user) return []
      
      const { data, error } = await supabase.rpc('get_cart_items', {
        p_user_id: user.id
      })
      
      if (error) throw error
      return (data || []) as CartItemCRDT[]
    },
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000 // Consider data stale after 10 seconds
  })
  
  // Get current epoch
  const getCurrentEpoch = useCallback(async (): Promise<number> => {
    if (!user) return 0
    
    const { data } = await supabase
      .from('cart_epochs')
      .select('current_epoch')
      .eq('user_id', user.id)
      .single()
    
    return data?.current_epoch || 0
  }, [user, supabase])
  
  // Initialize intent emitter
  useEffect(() => {
    intentEmitter.initialize()
    
    return () => {
      intentEmitter.destroy()
    }
  }, [])
  
  // Handle user authentication changes
  useEffect(() => {
    if (user) {
      sessionManager.upgradeAnonymousSession(user.id)
    }
  }, [user])
  
  // Add item to cart
  const addItem = useCallback(async (
    productId: string,
    quantity: number = 1,
    color?: string | null,
    size?: string | null
  ) => {
    setIsSyncing(true)
    try {
      const currentEpoch = await getCurrentEpoch()
      const skuId = generateSkuId(productId, color, size)
      
      await intentEmitter.emitIntent({
        intent_type: 'INC',
        sku_id: skuId,
        delta: quantity,
        intent_epoch: currentEpoch
      })
      
      // Invalidate cart query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id] })
      
    } finally {
      setIsSyncing(false)
    }
  }, [intentEmitter, getCurrentEpoch, queryClient, user?.id])
  
  // Decrease item quantity
  const decreaseItem = useCallback(async (
    productId: string,
    quantity: number = 1,
    color?: string | null,
    size?: string | null
  ) => {
    setIsSyncing(true)
    try {
      const currentEpoch = await getCurrentEpoch()
      const skuId = generateSkuId(productId, color, size)
      
      await intentEmitter.emitIntent({
        intent_type: 'DEC',
        sku_id: skuId,
        delta: quantity,
        intent_epoch: currentEpoch
      })
      
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id] })
      
    } finally {
      setIsSyncing(false)
    }
  }, [intentEmitter, getCurrentEpoch, queryClient, user?.id])
  
  // Remove item from cart
  const removeItem = useCallback(async (
    productId: string,
    color?: string | null,
    size?: string | null
  ) => {
    setIsSyncing(true)
    try {
      const currentEpoch = await getCurrentEpoch()
      const skuId = generateSkuId(productId, color, size)
      
      await intentEmitter.emitIntent({
        intent_type: 'REMOVE',
        sku_id: skuId,
        intent_epoch: currentEpoch
      })
      
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id] })
      
    } finally {
      setIsSyncing(false)
    }
  }, [intentEmitter, getCurrentEpoch, queryClient, user?.id])
  
  // Clear entire cart
  const clearCart = useCallback(async () => {
    setIsSyncing(true)
    try {
      await intentEmitter.emitIntent({
        intent_type: 'CLEAR',
        intent_epoch: 0
      })
      
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id] })
      
    } finally {
      setIsSyncing(false)
    }
  }, [intentEmitter, queryClient, user?.id])
  
  // Utility functions
  const getTotalQuantity = useCallback((): number => {
    return (cartState || []).reduce((total: number, item) => 
      total + item.effective_quantity, 0
    )
  }, [cartState])
  
  const getTotalPrice = useCallback((): number => {
    // Note: Price calculation requires product data
    // This is a placeholder - actual implementation would need product lookup
    return 0
  }, [])
  
  const getItemQuantity = useCallback((skuId: string): number => {
    const item = (cartState || []).find((item: any) => item.sku_id === skuId)
    return item?.effective_quantity || 0
  }, [cartState])
  
  return {
    // State
    items: cartState || [],
    isLoading,
    isSyncing,
    
    // Actions
    addItem,
    decreaseItem,
    removeItem,
    clearCart,
    
    // Utilities
    getTotalQuantity,
    getTotalPrice,
    getItemQuantity
  }
}

// Legacy compatibility helper
export function convertToLegacyFormat(cartItems: CartItemCRDT[]): CartItemLegacy[] {
  // This function converts CRDT cart items to legacy format for compatibility
  // Note: This is a simplified conversion - actual implementation would need product data
  return cartItems.map(item => {
    const { product_id, color, size } = parseSkuId(item.sku_id)
    
    return {
      product_id,
      quantity: item.effective_quantity,
      price: 0, // Placeholder - would need product lookup
      currency: 'USD', // Placeholder
      name: '', // Placeholder - would need product lookup
      image: '', // Placeholder - would need product lookup
      color,
      size
    }
  })
}