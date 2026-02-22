// Cart CRDT System - Intent Emission
// ============================================================
// Intent emission and management for cart CRDT system
// ============================================================

import { createClient } from '@/lib/supabase/client'
import type { CartSessionManager } from './session'

export interface CartIntent {
  intent_id: string
  intent_type: 'INC' | 'DEC' | 'REMOVE' | 'CLEAR'
  session_id: string
  sku_id?: string
  delta?: number
  intent_epoch: number
  client_ts: number
}

export class IntentEmitter {
  private pendingIntents: CartIntent[] = []
  private isOnline = true

  constructor(private sessionManager: CartSessionManager) {
    this.initialize()
  }

  async initialize(): Promise<void> {
    // Load pending intents from localStorage
    this.loadPendingIntents()
    
    // Set up online/offline detection
    this.setupNetworkDetection()
    
    // Retry pending intents if online
    if (this.isOnline) {
      await this.retryPendingIntents()
    }
  }

  async emitIntent(params: {
    intent_type: 'INC' | 'DEC' | 'REMOVE' | 'CLEAR'
    sku_id?: string
    delta?: number
    intent_epoch: number
  }): Promise<void> {
    const sessionId = await this.sessionManager.getSessionId()
    
    const intent: CartIntent = {
      intent_id: this.generateIntentId(),
      intent_type: params.intent_type,
      session_id: sessionId,
      sku_id: params.sku_id,
      delta: params.delta,
      intent_epoch: params.intent_epoch,
      client_ts: Date.now()
    }

    if (this.isOnline) {
      try {
        await this.sendIntent(intent)
      } catch (error) {
        console.warn('Failed to send intent, storing locally:', error)
        this.storeIntent(intent)
      }
    } else {
      this.storeIntent(intent)
    }
  }

  private async sendIntent(intent: CartIntent): Promise<void> {
    const supabase = createClient()
    
    const { error } = await supabase.rpc('emit_cart_intent', {
      p_intent: {
        intent_id: intent.intent_id,
        intent_type: intent.intent_type,
        session_id: intent.session_id,
        sku_id: intent.sku_id,
        delta: intent.delta,
        intent_epoch: intent.intent_epoch,
        client_ts: intent.client_ts
      }
    })

    if (error) {
      throw new Error(`Failed to emit intent: ${error.message}`)
    }
  }

  private storeIntent(intent: CartIntent): void {
    this.pendingIntents.push(intent)
    localStorage.setItem('cart-pending-intents', JSON.stringify(this.pendingIntents))
  }

  private loadPendingIntents(): void {
    try {
      const stored = localStorage.getItem('cart-pending-intents')
      if (stored) {
        this.pendingIntents = JSON.parse(stored)
      }
    } catch (error) {
      console.warn('Failed to load pending intents:', error)
      this.pendingIntents = []
    }
  }

  private async retryPendingIntents(): Promise<void> {
    if (this.pendingIntents.length === 0) return

    const intentsToRetry = [...this.pendingIntents]
    this.pendingIntents = []

    for (const intent of intentsToRetry) {
      try {
        await this.sendIntent(intent)
      } catch (error) {
        console.warn('Failed to retry intent, keeping in pending:', error)
        this.pendingIntents.push(intent)
      }
    }

    if (this.pendingIntents.length > 0) {
      localStorage.setItem('cart-pending-intents', JSON.stringify(this.pendingIntents))
    } else {
      localStorage.removeItem('cart-pending-intents')
    }
  }

  private setupNetworkDetection(): void {
    this.isOnline = navigator.onLine
    
    window.addEventListener('online', () => {
      this.isOnline = true
      this.retryPendingIntents()
    })

    window.addEventListener('offline', () => {
      this.isOnline = false
    })
  }

  private generateIntentId(): string {
    return 'intent_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  destroy(): void {
    window.removeEventListener('online', () => {})
    window.removeEventListener('offline', () => {})
  }
}