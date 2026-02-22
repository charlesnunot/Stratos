// Cart CRDT System - Session Management
// ============================================================
// Session management for cart CRDT system
// ============================================================

import { createClient } from '@/lib/supabase/client'

export class CartSessionManager {
  private sessionId: string | null = null
  private anonymousToken: string | null = null

  async getSessionId(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Authenticated user - get or create auth session
      const { data: session } = await supabase
        .from('cart_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('session_type', 'auth')
        .single()

      if (session) {
        this.sessionId = session.id
        return session.id
      }

      // Create new auth session
      const { data: newSession } = await supabase
        .from('cart_sessions')
        .insert({
          user_id: user.id,
          session_type: 'auth',
          user_agent: navigator.userAgent,
          ip_address: null // Will be set by server
        })
        .select('id')
        .single()

      if (newSession) {
        this.sessionId = newSession.id
        return newSession.id
      }

      throw new Error('Failed to create cart session')
    } else {
      // Anonymous user - get or create anonymous session
      let token = localStorage.getItem('cart-anonymous-token')
      
      if (!token) {
        token = this.generateAnonymousToken()
        localStorage.setItem('cart-anonymous-token', token)
      }

      this.anonymousToken = token

      const { data: session } = await supabase
        .from('cart_sessions')
        .select('id')
        .eq('session_type', 'anonymous')
        .eq('anonymous_token', token)
        .single()

      if (session) {
        this.sessionId = session.id
        return session.id
      }

      // Create new anonymous session
      const { data: newSession } = await supabase
        .from('cart_sessions')
        .insert({
          session_type: 'anonymous',
          anonymous_token: token,
          user_agent: navigator.userAgent,
          ip_address: null,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        })
        .select('id')
        .single()

      if (newSession) {
        this.sessionId = newSession.id
        return newSession.id
      }

      throw new Error('Failed to create anonymous cart session')
    }
  }

  async upgradeAnonymousSession(userId: string): Promise<void> {
    if (!this.anonymousToken) {
      return
    }

    const supabase = createClient()
    
    // Merge anonymous session into authenticated session
    await supabase.rpc('merge_cart_sessions', {
      p_anonymous_token: this.anonymousToken,
      p_user_id: userId
    })

    // Clear anonymous token
    localStorage.removeItem('cart-anonymous-token')
    this.anonymousToken = null
    this.sessionId = null
  }

  private generateAnonymousToken(): string {
    return 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  destroy(): void {
    this.sessionId = null
    this.anonymousToken = null
  }
}