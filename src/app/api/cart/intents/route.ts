// Cart CRDT System - Intent API
// ============================================================
// API endpoint for batch intent processing
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
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
    const { intents } = await request.json()
    
    if (!intents || !Array.isArray(intents)) {
      return NextResponse.json(
        { error: 'intents array is required' },
        { status: 400 }
      )
    }
    
    // Validate intents structure
    for (const intent of intents) {
      if (!intent.intent_type || !intent.intent_id || !intent.client_ts) {
        return NextResponse.json(
          { error: 'Invalid intent structure' },
          { status: 400 }
        )
      }
    }
    
    // Batch apply intents using PROCEDURE
    const { data: results, error } = await supabase.rpc('batch_apply_cart_intents', {
      p_user_id: user.id,
      p_intents: intents,
      p_results: []
    })
    
    if (error) {
      console.error('Error batch applying intents:', error)
      return NextResponse.json(
        { error: 'Failed to process intents' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      results: results || []
    })
    
  } catch (error) {
    console.error('Unexpected error in intents POST:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}