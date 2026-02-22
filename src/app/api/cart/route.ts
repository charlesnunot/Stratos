// Cart CRDT System - API Routes
// ============================================================
// RESTful API endpoints for cart operations
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Get cart items
    const { data: cartItems, error } = await supabase.rpc('get_cart_items', {
      p_user_id: user.id
    })
    
    if (error) {
      console.error('Error fetching cart items:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cart items' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      items: cartItems || [],
      total: (cartItems || []).reduce((sum: number, item: any) => sum + item.effective_quantity, 0)
    })
    
  } catch (error) {
    console.error('Unexpected error in cart GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Parse request body
    const { skuId } = await request.json()
    
    if (!skuId) {
      return NextResponse.json(
        { error: 'skuId is required' },
        { status: 400 }
      )
    }
    
    // Get current epoch
    const { data: epochData } = await supabase
      .from('cart_epochs')
      .select('current_epoch')
      .eq('user_id', user.id)
      .single()
    
    const currentEpoch = epochData?.current_epoch || 0
    
    // Get session ID
    const { data: sessionData } = await supabase
      .from('cart_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('session_type', 'auth')
      .single()
    
    if (!sessionData) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }
    
    // Apply remove intent
    const { error } = await supabase.rpc('apply_cart_remove_intent', {
      p_user_id: user.id,
      p_session_id: sessionData.id,
      p_sku_id: skuId,
      p_intent_epoch: currentEpoch,
      p_intent_id: crypto.randomUUID()
    })
    
    if (error) {
      console.error('Error removing item:', error)
      return NextResponse.json(
        { error: 'Failed to remove item from cart' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Unexpected error in cart DELETE:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}