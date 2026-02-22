// Cart CRDT System - Type Definitions
// ============================================================
// Type definitions for cart CRDT system
// ============================================================

export interface CartIntent {
  intent_id: string
  intent_type: 'INC' | 'DEC' | 'REMOVE' | 'CLEAR'
  session_id: string
  sku_id?: string
  delta?: number
  intent_epoch: number
  client_ts: number
}

export interface CartItemCRDT {
  user_id: string
  sku_id: string
  
  // PN-Counter fields (CRDT)
  pos: Record<string, number>  // Positive counters per session
  pos_epoch: Record<string, number>  // Epoch for each pos increment
  neg: Record<string, number>  // Negative counters per session
  neg_epoch: Record<string, number>  // Epoch for each neg increment
  
  // Remove fence (Causal Remove)
  remove_fence: Record<string, number>  // Fence values per session
  remove_epoch: Record<string, number>  // Epoch when remove was applied
  
  // Epoch tracking
  last_epoch: number
  
  // Computed field (from database view)
  effective_quantity: number
  
  // Timestamps
  created_at: string
  updated_at: string
}

export interface CartSession {
  id: string
  user_id: string | null
  session_type: 'auth' | 'anonymous'
  anonymous_token: string | null
  user_agent: string | null
  ip_address: string | null
  created_at: string
  last_active_at: string
  expires_at: string | null
}

export interface CartEpoch {
  user_id: string
  current_epoch: number
  created_at: string
  updated_at: string
}

export interface CartSyncStatus {
  isSyncing: boolean
  lastSync: number | null
  pendingIntents: number
  hasError: boolean
  errorMessage: string | null
}

export interface CartItemDisplay {
  sku_id: string
  effective_quantity: number
  product_id: string
  color: string | null
  size: string | null
  price: number
  currency: string
  name: string
  image: string
  stock: number | null
  is_selected: boolean
}

export interface CartStats {
  totalItems: number
  selectedItems: number
  totalValue: number
  selectedValue: number
}

// Legacy cart item format for backward compatibility
export interface CartItemLegacy {
  product_id: string
  quantity: number
  price: number
  currency: string
  name: string
  image: string
  color: string | null
  size: string | null
}