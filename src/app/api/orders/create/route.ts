/**
 * Order creation API
 * Supports multiple products and multiple sellers (creates separate orders per seller)
 * Note: Deposit check is now done at payment time, not at order creation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateSellerPaymentReady } from '@/lib/payments/validate-seller-payment-ready'

interface OrderItem {
  product_id: string
  quantity: number
  price: number
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[orders/create] Missing required env:', {
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceRoleKey: !!serviceRoleKey,
      })
      return NextResponse.json(
        {
          error: 'Server configuration error',
          details: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Please configure environment variables.',
        },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Support both old format (single product) and new format (items array)
    const items: OrderItem[] = body.items || [
      {
        product_id: body.product_id,
        quantity: body.quantity,
        price: body.unit_price || body.price,
      },
    ]
    
    const {
      currency = 'USD',
      payment_method,
      shipping_address,
      shipping_address_id,
      affiliate_post_id: bodyAffiliatePostId,
    } = body

    // Get affiliate_post_id with priority: request body > cookie
    let affiliatePostId: string | null = bodyAffiliatePostId || null
    if (!affiliatePostId) {
      // Try to get from cookie
      const cookieHeader = request.headers.get('cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [name, value] = cookie.trim().split('=')
          if (name && value) {
            acc[name] = value
          }
          return acc
        }, {} as Record<string, string>)
        affiliatePostId = cookies['affiliate_post_id'] || null
      }
    }

    // Validate required fields
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: items array is required' },
        { status: 400 }
      )
    }

    // Validate each item
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.price === undefined) {
        return NextResponse.json(
          { error: 'Missing required fields in items: product_id, quantity, and price are required' },
          { status: 400 }
        )
      }
      if (item.quantity <= 0) {
        return NextResponse.json(
          { error: 'Quantity must be greater than 0' },
          { status: 400 }
        )
      }
    }

    // Get all product IDs
    const productIds = items.map((item) => item.product_id)

    // Fetch products using user-authenticated client (fixes "permission denied for schema public")
    let query = supabase
      .from('products')
      .select('id, status, stock, seller_id, price, name')

    if (productIds.length === 1) {
      query = query.eq('id', productIds[0])
    } else if (productIds.length > 1) {
      query = query.in('id', productIds)
    } else {
      return NextResponse.json(
        { error: 'No product IDs provided' },
        { status: 400 }
      )
    }

    const { data: products, error: productsError } = await query

    if (productsError) {
      console.error('[orders/create] Error fetching products:', {
        code: productsError.code,
        message: productsError.message,
        productIds: productIds,
        productIdsCount: productIds.length,
      })
      return NextResponse.json(
        {
          error: 'Failed to fetch products',
          details: productsError.message,
          code: productsError.code,
        },
        { status: 500 }
      )
    }

    // 如果某些产品不存在，过滤掉它们并继续处理存在的产品
    if (!products || products.length === 0) {
      return NextResponse.json(
        { error: 'No valid products found' },
        { status: 400 }
      )
    }

    // 如果产品数量不匹配，过滤掉不存在的产品
    let filteredItems = items
    const warnings: string[] = []
    
    if (products.length !== productIds.length) {
      const foundProductIds = new Set(products.map((p) => p.id))
      const missingProductIds = productIds.filter((id) => !foundProductIds.has(id))
      
      // 如果所有产品都不存在，返回错误
      if (products.length === 0) {
        return NextResponse.json(
          { error: 'All products not found', missingProducts: missingProductIds },
          { status: 404 }
        )
      }
      
      // 如果部分产品不存在，过滤掉它们并继续处理存在的产品
      filteredItems = items.filter((item) => foundProductIds.has(item.product_id))
      warnings.push(`${missingProductIds.length} product(s) not found and were removed from the order`)
    }

    // Create a map for quick product lookup
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Validate all products (only the filtered items)
    const validationErrors: string[] = []
    for (const item of filteredItems) {
      const product = productMap.get(item.product_id)
      if (!product) {
        validationErrors.push(`Product ${item.product_id} not found`)
        continue
      }

      if (product.status !== 'active') {
        validationErrors.push(`Product ${product.name || item.product_id} is not available (status: ${product.status})`)
        continue
      }

      if (product.stock != null && product.stock < item.quantity) {
        validationErrors.push(`Insufficient stock for product ${product.name || item.product_id} (available: ${product.stock}, requested: ${item.quantity})`)
        continue
      }

      // Verify price matches (allow small floating point differences)
      const priceDiff = Math.abs(product.price - item.price)
      if (priceDiff > 0.01) {
        validationErrors.push(`Price mismatch for product ${product.name || item.product_id} (current: ${product.price}, cart: ${item.price})`)
        continue
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationErrors,
        },
        { status: 400 }
      )
    }

    let supabaseAdmin
    try {
      const { createClient: createAdminClient } = await import('@supabase/supabase-js')
      supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    } catch (adminErr: unknown) {
      const err = adminErr as { message?: string; name?: string }
      console.error('[orders/create] Failed to create Supabase admin client:', {
        message: err?.message,
        name: err?.name,
      })
      return NextResponse.json(
        {
          error: 'Server configuration error',
          details: 'Failed to initialize admin client. ' + (err?.message ?? 'Unknown error'),
        },
        { status: 500 }
      )
    }

    // Validate and get affiliate_post information if affiliate_post_id is provided
    let affiliatePost: { id: string; affiliate_id: string; product_id: string } | null = null
    if (affiliatePostId) {
      const { data: postData, error: postError } = await supabaseAdmin
        .from('affiliate_posts')
        .select('id, affiliate_id, product_id')
        .eq('id', affiliatePostId)
        .single()

      if (postError || !postData) {
        console.warn('[orders/create] Invalid affiliate_post_id:', {
          affiliatePostId,
          error: postError?.message,
        })
        // Don't fail the order creation, just log and continue without affiliate attribution
        affiliatePostId = null
      } else {
        affiliatePost = postData
      }
    }

    // Group items by seller (using filtered items)
    const itemsBySeller = new Map<string, OrderItem[]>()
    for (const item of filteredItems) {
      const product = productMap.get(item.product_id)!
      const sellerId = product.seller_id
      if (!itemsBySeller.has(sellerId)) {
        itemsBySeller.set(sellerId, [])
      }
      itemsBySeller.get(sellerId)!.push(item)
    }

    // Calculate total amount for all sellers (for parent order)
    let allSellersTotal = 0
    for (const [sellerId, sellerItems] of Array.from(itemsBySeller.entries())) {
      const totalAmount = sellerItems.reduce(
        (sum: number, item: OrderItem) => sum + item.price * item.quantity,
        0
      )
      allSellersTotal += totalAmount
    }

    // Create parent order group (if multiple sellers, or always create for consistency)
    const orderGroupNumber = `GRP-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`
    const { data: orderGroup, error: orderGroupError } = await supabaseAdmin
      .from('order_groups')
      .insert({
        order_group_number: orderGroupNumber,
        buyer_id: user.id,
        total_amount: allSellersTotal,
        currency,
        payment_status: 'pending',
        order_status: 'pending',
        shipping_address: shipping_address || (shipping_address_id ? null : undefined), // Will be set after address lookup
      })
      .select()
      .single()

    if (orderGroupError) {
      console.error('[orders/create] Error creating order group:', orderGroupError)
      return NextResponse.json(
        {
          error: 'Failed to create order group',
          details: orderGroupError.message,
        },
        { status: 500 }
      )
    }

    // Handle shipping address for order group if address_id provided
    let finalShippingAddress = shipping_address
    if (shipping_address_id && !finalShippingAddress) {
      const { data: addressFromTable, error: addressError } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('id', shipping_address_id)
        .eq('user_id', user.id)
        .single()

      if (addressError || !addressFromTable) {
        return NextResponse.json(
          {
            error: 'Shipping address not found',
            details: addressError?.message || 'The specified address ID does not exist or does not belong to you',
          },
          { status: 404 }
        )
      }

      finalShippingAddress = {
        recipientName: addressFromTable.recipient_name,
        phone: addressFromTable.phone,
        country: addressFromTable.country,
        state: addressFromTable.state || '',
        city: addressFromTable.city || '',
        address: addressFromTable.street_address,
        streetAddress: addressFromTable.street_address,
        postalCode: addressFromTable.postal_code || '',
      }

      // Update order group with shipping address
      await supabaseAdmin
        .from('order_groups')
        .update({ shipping_address: finalShippingAddress })
        .eq('id', orderGroup.id)
    } else if (!finalShippingAddress) {
      return NextResponse.json(
        {
          error: 'Shipping address is required',
          details: 'Please provide either shipping_address_id or shipping_address',
        },
        { status: 400 }
      )
    }

    // Validate shipping address completeness
    if (finalShippingAddress) {
      const addr = finalShippingAddress as any
      if (!addr.recipientName || !addr.phone || !addr.address || !addr.country) {
        return NextResponse.json(
          {
            error: 'Shipping address is incomplete',
            details: 'Please provide recipientName, phone, address (or streetAddress), and country',
          },
          { status: 400 }
        )
      }
    }

    // Batch fetch all seller profiles and payment accounts to avoid N+1 queries
    const sellerIds = Array.from(itemsBySeller.keys())
    
    // Batch query all seller profiles
    const { data: sellerProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, payment_provider, payment_account_id, seller_payout_eligibility')
      .in('id', sellerIds)

    if (profilesError) {
      console.error('[orders/create] Error fetching seller profiles:', profilesError)
      return NextResponse.json(
        {
          error: 'Failed to fetch seller information',
          details: profilesError.message,
        },
        { status: 500 }
      )
    }

    // Batch query all payment accounts for these sellers
    const { data: paymentAccounts, error: accountsError } = await supabaseAdmin
      .from('payment_accounts')
      .select('seller_id, account_type, is_default, is_verified, currency')
      .in('seller_id', sellerIds)
      .eq('is_verified', true)

    if (accountsError) {
      console.error('[orders/create] Error fetching payment accounts:', accountsError)
      // Non-fatal, continue without payment account info
    }

    // Create maps for quick lookup
    const profileMap = new Map(sellerProfiles?.map(p => [p.id, p]) || [])
    const accountMap = new Map<string, any[]>()
    
    // Group payment accounts by seller_id-currency for quick lookup
    paymentAccounts?.forEach(account => {
      const key = `${account.seller_id}-${account.currency || currency}`
      if (!accountMap.has(key)) {
        accountMap.set(key, [])
      }
      accountMap.get(key)!.push(account)
    })

    // Create child orders for each seller
    const createdOrders: any[] = []
    const errors: string[] = []

    for (const [sellerId, sellerItems] of Array.from(itemsBySeller.entries())) {
      try {
        // ============================================
        // FIRST CHECK: Validate seller payment readiness before order creation
        // ============================================
        // If payment_method is provided, validate that seller supports it
        const validationResult = await validateSellerPaymentReady({
          sellerId,
          supabaseAdmin,
          paymentMethod: payment_method || undefined, // Pass payment method if provided
        })

        if (!validationResult.canAcceptPayment) {
          // UX Boundary: First check failure = do not create order
          // Return 400/403, do not create order record, do not allow "wait and pay"
          const statusCode = validationResult.reason?.includes('not found') ? 404 : 
                            validationResult.reason?.includes('subscription') ? 403 : 403
          
          // Provide specific error message for payment method mismatch
          if (validationResult.reason?.includes('SELLER_PAYMENT_METHOD_MISMATCH')) {
            errors.push(
              `Cannot create order for seller ${sellerId}: Seller uses ${validationResult.paymentProvider}, but ${payment_method} was requested. Please select a payment method that the seller supports.`
            )
          } else {
            errors.push(
              `Cannot create order for seller ${sellerId}: ${validationResult.reason || 'Seller is not ready to accept payments'}. ` +
              `Please ensure the seller has an active subscription and a bound payment account.`
            )
          }
          continue // Skip this seller, continue with other sellers
        }

        // Get seller profile from map (already fetched in batch)
        const sellerProfile = profileMap.get(sellerId)

        // Calculate total amount for this seller's order
        const totalAmount = sellerItems.reduce(
          (sum: number, item: OrderItem) => sum + item.price * item.quantity,
          0
        )

        // Deposit check is now done at payment time, not at order creation
        // This allows orders to be created even if deposit is required
        // The deposit check will happen when buyer attempts to pay (creates payment session)

        // Generate order number
        const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`

        // Use first product for order table compatibility (legacy fields)
        const firstItem = sellerItems[0]
        const firstProduct = productMap.get(firstItem.product_id)!

        // Calculate expiry time (30 minutes from now, configurable via env)
        const expiryMinutes = parseInt(process.env.ORDER_EXPIRY_MINUTES || '30', 10)
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()

        // Get seller's default payment method from their payment accounts (using batch-fetched data)
        // Payment method is determined by seller, not buyer
        let sellerPaymentMethod = payment_method || null
        if (!sellerPaymentMethod) {
          // Get accounts for this seller and currency from map
          const accountKey = `${sellerId}-${currency}`
          const sellerAccounts = accountMap.get(accountKey) || []
          
          // Try to find default account first
          const defaultAccount = sellerAccounts.find(acc => acc.is_default === true)
          
          if (defaultAccount?.account_type) {
            sellerPaymentMethod = defaultAccount.account_type
          } else if (sellerAccounts.length > 0) {
            // If no default account found, use the first verified account for this currency
            // Sort by created_at descending (most recent first)
            sellerAccounts.sort((a, b) => {
              const aTime = new Date(a.created_at || 0).getTime()
              const bTime = new Date(b.created_at || 0).getTime()
              return bTime - aTime
            })
            sellerPaymentMethod = sellerAccounts[0].account_type
          }
        }

        // If still no payment method found, use a default (database requires NOT NULL)
        // This should rarely happen if sellers have set up their payment accounts
        if (!sellerPaymentMethod) {
          sellerPaymentMethod = 'stripe' // Default fallback
          console.warn(`[orders/create] No payment account found for seller ${sellerId}, using default 'stripe'`)
        }

        // Handle shipping address: get from address table if ID provided, otherwise use provided address
        let finalShippingAddress = shipping_address
        if (shipping_address_id) {
          const { data: addressFromTable, error: addressError } = await supabase
            .from('user_addresses')
            .select('*')
            .eq('id', shipping_address_id)
            .eq('user_id', user.id)
            .single()

          if (addressError || !addressFromTable) {
            return NextResponse.json(
              {
                error: 'Shipping address not found',
                details: addressError?.message || 'The specified address ID does not exist or does not belong to you',
              },
              { status: 404 }
            )
          }

          // Convert address table format to order format
          finalShippingAddress = {
            recipientName: addressFromTable.recipient_name,
            phone: addressFromTable.phone,
            country: addressFromTable.country,
            state: addressFromTable.state || '',
            city: addressFromTable.city || '',
            address: addressFromTable.street_address,  // 用于后端验证
            streetAddress: addressFromTable.street_address,  // 用于前端显示
            postalCode: addressFromTable.postal_code || '',
          }
        } else if (!shipping_address) {
          return NextResponse.json(
            {
              error: 'Shipping address is required',
              details: 'Please provide either shipping_address_id or shipping_address',
            },
            { status: 400 }
          )
        }

        // Validate shipping address completeness
        if (finalShippingAddress) {
          const addr = finalShippingAddress as any
          if (!addr.recipientName || !addr.phone || !addr.address || !addr.country) {
            return NextResponse.json(
              {
                error: 'Shipping address is incomplete',
                details: 'Please provide recipientName, phone, address (or streetAddress), and country',
              },
              { status: 400 }
            )
          }
        }

        // Determine affiliate attribution for this order
        // Only set affiliate_post_id if the affiliate_post's product_id matches one of the order items
        let orderAffiliatePostId: string | null = null
        let orderAffiliateId: string | null = null
        
        if (affiliatePost) {
          // Check if any item in this seller's order matches the affiliate_post's product_id
          const hasMatchingProduct = sellerItems.some(item => item.product_id === affiliatePost!.product_id)
          if (hasMatchingProduct) {
            orderAffiliatePostId = affiliatePost.id
            orderAffiliateId = affiliatePost.affiliate_id
          }
        }

        // Create child order with status snapshot (for audit and appeals)
        const { data: order, error: orderError } = await supabaseAdmin
          .from('orders')
          .insert({
            order_number: orderNumber,
            buyer_id: user.id,
            seller_id: sellerId,
            parent_order_id: orderGroup.id, // Link to parent order group
            product_id: firstItem.product_id, // First product for compatibility
            quantity: sellerItems.reduce((sum: number, item: OrderItem) => sum + item.quantity, 0), // Total quantity
            unit_price: firstItem.price, // First item price for compatibility
            total_amount: totalAmount,
            currency,
            payment_method: sellerPaymentMethod, // Payment method determined by seller's account
            payment_status: 'pending',
            order_status: 'pending',
            seller_payment_status: 'pending', // Individual seller payment status
            shipping_address: finalShippingAddress,
            expires_at: expiresAt, // Set order expiry time
            // Affiliate attribution
            affiliate_post_id: orderAffiliatePostId,
            affiliate_id: orderAffiliateId, // Derived from affiliate_post
            // Status snapshot at order creation (for audit and appeals)
            seller_payout_eligibility_at_order_creation: sellerProfile?.seller_payout_eligibility || null,
            seller_payment_provider_snapshot: sellerProfile?.payment_provider || null,
            seller_payment_account_id_snapshot: sellerProfile?.payment_account_id || null,
          })
          .select()
          .single()

        if (orderError) {
          console.error('[orders/create] Error creating order:', {
            sellerId,
            orderNumber,
            code: orderError.code,
            message: orderError.message,
            details: orderError.details,
          })
          errors.push(`Failed to create order for seller ${sellerId}: ${orderError.message}`)
          continue
        }

        // Create order items
        const orderItems = sellerItems.map((item: OrderItem) => ({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
        }))

        const { error: itemsError } = await supabaseAdmin
          .from('order_items')
          .insert(orderItems)

        if (itemsError) {
          console.error('[orders/create] Error creating order items:', {
            orderId: order.id,
            sellerId,
            code: itemsError.code,
            message: itemsError.message,
          })
          // Don't fail the entire request if order_items insert fails
          // The order is already created, items can be added later
        }

        createdOrders.push(order)

        // Send notification to seller about pending payment order
        if (order.seller_id) {
          try {
            await supabaseAdmin.from('notifications').insert({
              user_id: order.seller_id,
              type: 'order',
              title: '新订单待支付',
              content: `您收到了一个新订单 ${order.order_number}，金额 ¥${totalAmount.toFixed(2)}，等待买家支付`,
              related_id: order.id,
              related_type: 'order',
              link: `/orders/${order.id}`,
              actor_id: user.id, // 买家 ID
            })
          } catch (notificationError) {
            // Log error but don't fail order creation
            console.error('[orders/create] Failed to send notification to seller:', {
              sellerId: order.seller_id,
              orderId: order.id,
              error: notificationError,
            })
          }
        }
      } catch (error: unknown) {
        const err = error as { message?: string; stack?: string }
        console.error('[orders/create] Error processing order for seller:', {
          sellerId,
          errorMessage: err?.message,
          stack: err?.stack,
        })
        errors.push(`Error creating order for seller ${sellerId}: ${err?.message ?? 'Unknown error'}`)
      }
    }

    // If no orders were created, return classified business error
    if (createdOrders.length === 0) {
      const depositErrors = errors.filter(e =>
        e.includes('requires deposit') ||
        e.includes('Deposit check failed')
      )

      const validationErrors = errors.filter(e =>
        !e.includes('requires deposit') &&
        !e.includes('Deposit check failed')
      )

      // Note: Deposit errors no longer prevent order creation
      // They are handled as warnings and orders are created anyway
      // Only return error if there are validation errors (stock, price, etc.)

      // 业务校验失败 → 400
      if (validationErrors.length > 0) {
        return NextResponse.json(
          {
            error: 'Order validation failed',
            details: validationErrors,
          },
          { status: 400 }
        )
      }

      // 如果只有保证金错误，但订单已创建，不应该到这里
      // 默认：业务失败，不是服务器错误
      return NextResponse.json(
        {
          error: 'Failed to create any orders',
          details: errors,
        },
        { status: 400 }
      )
    }

    // Return parent order group and all child orders
    // Deposit check is now done at payment time, not at order creation
    return NextResponse.json(
      {
        orderGroup: {
          id: orderGroup.id,
          order_group_number: orderGroup.order_group_number,
          total_amount: orderGroup.total_amount,
          payment_status: orderGroup.payment_status,
          order_status: orderGroup.order_status,
        },
        orders: createdOrders, // Child orders
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    // Use unified error handling
    const { handleApiError } = await import('@/lib/api/error-handler')
    const { generateRequestId } = await import('@/lib/api/logger')
    
    return handleApiError(error, {
      userId: user?.id,
      path: '/api/orders/create',
      method: 'POST',
      requestId: generateRequestId(),
    })
  }
}
