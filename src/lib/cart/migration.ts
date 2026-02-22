// Cart CRDT System - Data Migration
// ============================================================
// Migration script from localStorage to CRDT-based cart system
// ============================================================

import { createClient } from '@/lib/supabase/client'
import { CartSessionManager } from './session'
import { IntentEmitter } from './intent'
import { generateSkuId } from './sku'
import { useState, useEffect } from 'react'

interface LegacyCartItem {
  product_id: string
  quantity: number
  price: number
  currency?: string
  name: string
  image: string
  color?: string | null
  size?: string | null
}

interface LegacyCartStorage {
  state: {
    items: LegacyCartItem[]
    selectedIds: string[]
  }
  version: number
}

/**
 * Check if migration is needed
 */
export async function checkMigrationNeeded(): Promise<boolean> {
  try {
    // Check if localStorage has legacy cart data
    const legacyData = localStorage.getItem('cart-storage')
    if (!legacyData) {
      return false
    }
    
    // Check if user is authenticated
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return false // Cannot migrate without authentication
    }
    
    // Check if migration has already been performed
    const migrationKey = `cart-migration-v5-${user.id}`
    const migrationStatus = localStorage.getItem(migrationKey)
    if (migrationStatus === 'completed') {
      return false
    }
    
    return true
  } catch (error) {
    console.warn('Error checking migration status:', error)
    return false
  }
}

/**
 * Migrate legacy cart data to new CRDT system
 */
export async function migrateLegacyCart(): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User must be authenticated to migrate cart data')
    }
    
    // Get legacy cart data
    const legacyData = localStorage.getItem('cart-storage')
    if (!legacyData) {
      throw new Error('No legacy cart data found')
    }
    
    const parsedData: LegacyCartStorage = JSON.parse(legacyData)
    const legacyItems = parsedData.state?.items || []
    
    if (legacyItems.length === 0) {
      // No items to migrate
      markMigrationCompleted(user.id)
      return true
    }
    
    console.log(`Migrating ${legacyItems.length} cart items to CRDT system...`)
    
    // Initialize cart instances
    const sessionManager = new CartSessionManager()
    const intentEmitter = new IntentEmitter(sessionManager)
    
    // Get current epoch
    const { data: epochData } = await supabase
      .from('cart_epochs')
      .select('current_epoch')
      .eq('user_id', user.id)
      .single()
    
    const currentEpoch = epochData?.current_epoch || 0
    
    // Migrate each item
    for (const item of legacyItems) {
      try {
        const skuId = generateSkuId(item.product_id, item.color, item.size)
        
        // Emit INC intent for each quantity unit (to preserve the exact quantity)
        for (let i = 0; i < item.quantity; i++) {
          await intentEmitter.emitIntent({
            intent_type: 'INC',
            sku_id: skuId,
            delta: 1,
            intent_epoch: currentEpoch
          })
        }
        
        console.log(`Migrated item: ${skuId} (quantity: ${item.quantity})`)
        
      } catch (itemError) {
        console.error(`Failed to migrate item ${item.product_id}:`, itemError)
        // Continue with next item
      }
    }
    
    // Wait for all intents to sync
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Verify migration
    const { data: migratedItems } = await supabase.rpc('get_cart_items', {
      p_user_id: user.id
    })
    
    const migratedCount = migratedItems?.length || 0
    console.log(`Migration completed. ${migratedCount} items in new system.`)
    
    // Mark migration as completed
    markMigrationCompleted(user.id)
    
    // Optionally clear legacy data (keep for rollback)
    // localStorage.removeItem('cart-storage')
    
    return true
    
  } catch (error) {
    console.error('Cart migration failed:', error)
    return false
  }
}

/**
 * Mark migration as completed for current user
 */
function markMigrationCompleted(userId: string): void {
  const migrationKey = `cart-migration-v5-${userId}`
  localStorage.setItem(migrationKey, 'completed')
}

/**
 * Rollback migration (for testing/debugging)
 */
export async function rollbackMigration(): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return
  
  // Clear migration status
  const migrationKey = `cart-migration-v5-${user.id}`
  localStorage.removeItem(migrationKey)
  
  console.log('Migration rollback completed')
}

/**
 * Get migration status
 */
export function getMigrationStatus(userId?: string): {
  needed: boolean
  completed: boolean
  legacyItemCount: number
} {
  try {
    const legacyData = localStorage.getItem('cart-storage')
    const legacyItems = legacyData ? 
      (JSON.parse(legacyData)?.state?.items || []) : []
    
    if (!userId) {
      return {
        needed: false,
        completed: false,
        legacyItemCount: legacyItems.length
      }
    }
    
    const migrationKey = `cart-migration-v5-${userId}`
    const migrationCompleted = localStorage.getItem(migrationKey) === 'completed'
    
    return {
      needed: legacyItems.length > 0 && !migrationCompleted,
      completed: migrationCompleted,
      legacyItemCount: legacyItems.length
    }
  } catch (error) {
    console.warn('Error getting migration status:', error)
    return {
      needed: false,
      completed: false,
      legacyItemCount: 0
    }
  }
}

/**
 * Migration component for React integration
 */
export function useCartMigration(userId?: string) {
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState(() => getMigrationStatus(userId))
  
  useEffect(() => {
    setMigrationStatus(getMigrationStatus(userId))
  }, [userId])
  
  const performMigration = async (): Promise<boolean> => {
    if (!migrationStatus.needed || isMigrating) {
      return false
    }
    
    setIsMigrating(true)
    try {
      const success = await migrateLegacyCart()
      setMigrationStatus(getMigrationStatus(userId))
      return success
    } finally {
      setIsMigrating(false)
    }
  }
  
  return {
    isMigrating,
    migrationStatus,
    performMigration
  }
}


