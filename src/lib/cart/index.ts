// Cart CRDT System - Main Export
// ============================================================
// Causal-Stable Shopping Cart (CSSC) Implementation
// ============================================================

// Core classes
export { CartSessionManager } from './session'
export { IntentEmitter } from './intent'

// Utilities
export { generateSkuId, parseSkuId } from './sku'

// Types
export type { 
  CartIntent, 
  CartItemCRDT, 
  CartItemLegacy,
  CartSession, 
  CartEpoch, 
  CartSyncStatus, 
  CartItemDisplay, 
  CartStats 
} from './types'

// Re-export everything for convenience
export * from './session'
export * from './intent'
export * from './sku'
export * from './types'
