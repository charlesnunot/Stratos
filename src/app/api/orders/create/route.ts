/**
 * Order creation API with deposit requirement check
 * Checks seller deposit requirements before allowing order creation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkSellerDepositRequirement } from '@/lib/deposits/check-deposit-requirement'
import { disableSellerPayment } from '@/lib/deposits/payment-control'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      seller_id,
      product_id,
      quantity,
      unit_price,
      total_amount,
      currency = 'USD',
      payment_method,
      shipping_address,
    } = body

    // Validate required fields
    if (!seller_id || !product_id || !quantity || !unit_price || !total_amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Use admin client for deposit check
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Check deposit requirement before creating order
    const depositCheck = await checkSellerDepositRequirement(
      seller_id,
      total_amount,
      supabaseAdmin
    )

    if (depositCheck.requiresDeposit) {
      // Disable seller payment immediately
      await disableSellerPayment(
        seller_id,
        'deposit_required',
        supabaseAdmin
      )

      return NextResponse.json(
        {
          error: 'Deposit required',
          requiresDeposit: true,
          requiredAmount: depositCheck.requiredAmount,
          currentTier: depositCheck.currentTier,
          suggestedTier: depositCheck.suggestedTier,
          reason: depositCheck.reason,
        },
        { status: 403 }
      )
    }

    // Check product exists, is active, and has sufficient stock
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, status, stock, seller_id')
      .eq('id', product_id)
      .single()

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    if (product.seller_id !== seller_id) {
      return NextResponse.json(
        { error: 'Product does not belong to this seller' },
        { status: 400 }
      )
    }

    if (product.status !== 'active') {
      return NextResponse.json(
        {
          error: 'Product is not available for purchase',
          status: product.status,
        },
        { status: 400 }
      )
    }

    if (product.stock != null && product.stock < quantity) {
      return NextResponse.json(
        { error: 'Insufficient stock' },
        { status: 400 }
      )
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        buyer_id: user.id,
        seller_id,
        product_id,
        quantity,
        unit_price,
        total_amount,
        currency,
        payment_method,
        payment_status: 'pending',
        order_status: 'pending',
        shipping_address,
      })
      .select()
      .single()

    if (orderError) {
      console.error('Error creating order:', orderError)
      return NextResponse.json(
        { error: `Failed to create order: ${orderError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ order }, { status: 201 })
  } catch (error: any) {
    console.error('Order creation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    )
  }
}
