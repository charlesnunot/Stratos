import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAlipayCallback, type AlipayCallbackParams } from '@/lib/payments/alipay'

export async function POST(request: NextRequest) {
  try {
    // Alipay sends form-urlencoded data, not JSON
    const formData = await request.formData()
    const params: AlipayCallbackParams = {
      out_trade_no: formData.get('out_trade_no')?.toString() || '',
      trade_no: formData.get('trade_no')?.toString() || '',
      trade_status: formData.get('trade_status')?.toString() || '',
      total_amount: formData.get('total_amount')?.toString() || '',
      sign: formData.get('sign')?.toString() || '',
    }
    
    // Add any other fields that might be present
    for (const [key, value] of formData.entries()) {
      if (!params[key as keyof AlipayCallbackParams]) {
        params[key] = value.toString()
      }
    }

    // Verify callback signature
    const isValid = await verifyAlipayCallback(params)
    if (!isValid) {
      if (process.env.NODE_ENV === 'development') {
      console.error('Invalid Alipay callback signature');
      }
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    const { out_trade_no, trade_no, trade_status, total_amount } = params

    // Use service role client for admin operations
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

    // Phase 0.1: Webhook event idempotency guard using trade_no as unique event ID
    if (!trade_no) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[alipay/callback] Missing trade_no for idempotency check');
      }
      return NextResponse.json(
        { error: 'Missing trade_no' },
        { status: 400 }
      )
    }
    const { data: webhookEventId, error: webhookEventError } = await supabaseAdmin.rpc(
      'process_webhook_event',
      {
        p_provider: 'alipay',
        p_event_id: trade_no,
        p_event_type: trade_status || 'callback',
        p_payload: { out_trade_no, trade_no, trade_status, total_amount },
      }
    )
    if (webhookEventError) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[alipay/callback] Failed to process webhook event:', webhookEventError);
      }
      return NextResponse.json(
        { error: 'Failed to process webhook event' },
        { status: 500 }
      )
    }
    if (webhookEventId === null) {
      if (process.env.NODE_ENV === 'development') {
      console.log('[alipay/callback] Duplicate event, skipping:', trade_no);
      }
      return NextResponse.json({ success: true, duplicate: true })
    }

    // Verify trade status
    if (trade_status !== 'TRADE_SUCCESS' && trade_status !== 'TRADE_FINISHED') {
      if (process.env.NODE_ENV === 'development') {
      console.log('Alipay trade not completed:', trade_status);
      }
      return NextResponse.json({ success: true }) // Acknowledge but don't process
    }

    // Callback audit log (non-blocking).
    try {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'alipay_callback',
        resourceId: trade_no,
        resourceType: 'payment_callback',
        result: 'success',
        timestamp: new Date().toISOString(),
        meta: { out_trade_no, trade_status, total_amount },
      })
    } catch (_) {
      // Ignore audit log failures so payment callback can continue.
    }

    // Handle subscription payment (out_trade_no = sub_<subscriptionId>_<timestamp>)
    if (out_trade_no.startsWith('sub_')) {
      const parts = out_trade_no.split('_')
      const subscriptionId = parts[1]
      if (!subscriptionId) {
        return NextResponse.json({ success: true })
      }
      const paidAmount = parseFloat(total_amount)
      const { activatePendingSubscription } = await import('@/lib/payments/process-subscription-payment')
      const result = await activatePendingSubscription({
        subscriptionId,
        provider: 'alipay',
        providerRef: trade_no,
        paidAmount,
        currency: 'CNY',
        supabaseAdmin,
      })
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to activate subscription' },
          { status: 400 }
        )
      }
      return NextResponse.json({ success: true })
    }

    // Handle platform fee payment (out_trade_no = platform_fee_<userId>_<timestamp>)
    if (out_trade_no.startsWith('platform_fee_')) {
      const parts = out_trade_no.split('_')
      const userId = parts[2] // platform_fee_<userId>_<timestamp>
      if (!userId) {
        return NextResponse.json({ success: true })
      }
      
      // Find payment transaction by provider_ref
      const { data: transaction, error: txError } = await supabaseAdmin
        .from('payment_transactions')
        .select('id, related_id, amount, currency, metadata')
        .eq('provider', 'alipay')
        .eq('provider_ref', trade_no)
        .eq('type', 'order')
        .maybeSingle()

      if (txError || !transaction) {
        // Try to find by metadata
        const { data: txByMetadata } = await supabaseAdmin
          .from('payment_transactions')
          .select('id, related_id, amount, currency, metadata')
          .eq('type', 'order')
          .eq('related_id', userId)
          .contains('metadata', { type: 'platform_fee' })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (txByMetadata) {
          // Update transaction status
          await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              provider_ref: trade_no,
            })
            .eq('id', txByMetadata.id)

          // Create notification (use content_key for i18n)
          const paidAmount = parseFloat(total_amount)
          const reason = (txByMetadata.metadata as any)?.reason || 'Platform service fee'
          await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            type: 'system',
            title: 'Platform Fee Payment Successful',
            content: `Platform fee of ${paidAmount.toFixed(2)} CNY paid successfully.`,
            related_type: 'order',
            related_id: txByMetadata.id,
            link: '/orders',
            content_key: 'platform_fee_paid',
            content_params: { amount: paidAmount.toFixed(2), currency: 'CNY', reason },
          })
        }
      } else {
        // Update transaction status
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', transaction.id)

        // Create notification (use content_key for i18n)
        const paidAmount = parseFloat(total_amount)
        const reason = (transaction.metadata as any)?.reason || 'Platform service fee'
        await supabaseAdmin.from('notifications').insert({
          user_id: userId,
          type: 'system',
          title: 'Platform Fee Payment Successful',
          content: `Platform fee of ${paidAmount.toFixed(2)} CNY paid successfully.`,
          related_type: 'order',
          related_id: transaction.id,
          link: '/orders',
          content_key: 'platform_fee_paid',
          content_params: { amount: paidAmount.toFixed(2), currency: 'CNY', reason },
        })
      }
      return NextResponse.json({ success: true })
    }

    // Handle deposit payment (out_trade_no = deposit_<lotId>_<timestamp>)
    if (out_trade_no.startsWith('deposit_')) {
      const parts = out_trade_no.split('_')
      const depositLotId = parts[1]
      if (!depositLotId) {
        return NextResponse.json({ success: true })
      }
      const { data: lot } = await supabaseAdmin
        .from('seller_deposit_lots')
        .select('id, seller_id, required_amount')
        .eq('id', depositLotId)
        .single()

      if (!lot) {
        if (process.env.NODE_ENV === 'development') {
        console.error('Deposit lot not found for Alipay callback:', depositLotId);
        }
        return NextResponse.json({ success: true })
      }

      const paidAmount = parseFloat(total_amount)
      const { data: existingTx } = await supabaseAdmin
        .from('payment_transactions')
        .select('id, status')
        .eq('provider', 'alipay')
        .eq('provider_ref', trade_no)
        .eq('type', 'deposit')
        .eq('related_id', depositLotId)
        .maybeSingle()

      if (existingTx?.status === 'paid') {
        return NextResponse.json({ success: true })
      }
      if (!existingTx) {
        await supabaseAdmin.from('payment_transactions').insert({
          type: 'deposit',
          provider: 'alipay',
          provider_ref: trade_no,
          amount: paidAmount,
          currency: 'CNY',
          status: 'paid',
          related_id: depositLotId,
          paid_at: new Date().toISOString(),
          metadata: { out_trade_no, trade_no, trade_status },
        })
      } else {
        await supabaseAdmin
          .from('payment_transactions')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', existingTx.id)
      }

      await supabaseAdmin
        .from('seller_deposit_lots')
        .update({ status: 'held', held_at: new Date().toISOString(), payment_provider: 'alipay', payment_session_id: trade_no })
        .eq('id', depositLotId)
        .eq('seller_id', lot.seller_id)

      const { enableSellerPayment } = await import('@/lib/deposits/payment-control')
      await enableSellerPayment(lot.seller_id, supabaseAdmin)
      return NextResponse.json({ success: true })
    }

    const supabase = await createClient()

    // Find order by order number
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', out_trade_no)
      .single()

    if (orderError || !order) {
      if (process.env.NODE_ENV === 'development') {
      console.error('Order not found for Alipay callback:', out_trade_no);
      }
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Check idempotency: Look for existing payment transaction
    const { data: existingTransaction, error: existingTransactionError } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, status')
      .eq('provider', 'alipay')
      .eq('provider_ref', trade_no)
      .maybeSingle()

    if (existingTransactionError) {
      return NextResponse.json(
        { error: `Failed to query existing payment transaction: ${existingTransactionError.message}` },
        { status: 500 }
      )
    }

    if (existingTransaction) {
      if (existingTransaction.status === 'paid') {
        // Already processed, return success (idempotency)
        if (process.env.NODE_ENV === 'development') {
        console.log('Alipay payment already processed:', trade_no);
        }
        return NextResponse.json({ success: true })
      }
      // Update existing transaction
      const { error: updateTxError } = await supabaseAdmin
        .from('payment_transactions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', existingTransaction.id)

      if (updateTxError) {
        return NextResponse.json(
          { error: `Failed to update payment transaction: ${updateTxError.message}` },
          { status: 500 }
        )
      }
    } else {
      // Verify amount with currency-based precision
      const paidAmount = parseFloat(total_amount)
      const orderCurrency = order.currency?.toUpperCase() || 'USD'
      const isZeroDecimalCurrency = ['JPY', 'KRW'].includes(orderCurrency)
      const precision = isZeroDecimalCurrency ? 0 : 0.01
      
      if (Math.abs(paidAmount - order.total_amount) > precision) {
        if (process.env.NODE_ENV === 'development') {
        console.error('Amount mismatch:', { paidAmount, orderAmount: order.total_amount, currency: orderCurrency });
        }
        return NextResponse.json(
          { error: 'Amount mismatch' },
          { status: 400 }
        )
      }

      // Create new payment transaction record
      const { error: insertTxError } = await supabaseAdmin.from('payment_transactions').insert({
        type: 'order',
        provider: 'alipay',
        provider_ref: trade_no,
        amount: paidAmount,
        currency: 'CNY',
        status: 'paid',
        related_id: order.id,
        paid_at: new Date().toISOString(),
        metadata: { out_trade_no, trade_no, trade_status },
      })

      if (insertTxError && insertTxError.code !== '23505') {
        return NextResponse.json(
          { error: `Failed to create payment transaction: ${insertTxError.message}` },
          { status: 500 }
        )
      }
    }

    // Check if order is already paid
    if (order.payment_status === 'paid') {
      if (process.env.NODE_ENV === 'development') {
      console.log('Order already paid:', order.id);
      }
      return NextResponse.json({ success: true })
    }

    // Use unified service layer to process order payment
    const paidAmount = parseFloat(total_amount)
    const { processOrderPayment } = await import('@/lib/payments/process-order-payment')
    const result = await processOrderPayment({
      orderId: order.id,
      amount: paidAmount,
      supabaseAdmin,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: `Failed to process order payment: ${result.error || 'unknown error'}` },
        { status: 500 }
      )
    }

    // Update order with payment method and trade_no
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_method: 'alipay',
        payment_intent_id: trade_no,
      })
      .eq('id', order.id)

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update order payment reference: ${updateError.message}` },
        { status: 500 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Alipay payment processed successfully:', {
        orderId: order.id,
        tradeNo: trade_no,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Alipay callback error:', {
        message: error.message,
      })
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process callback' },
      { status: 500 }
    )
  }
}

// Also handle GET requests (for return URL redirects)
// IMPORTANT: GET callback only redirects, does NOT process payments
// Payment processing is handled by POST callback (server-to-server)
// This prevents duplicate processing and ensures idempotency
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const params: AlipayCallbackParams = {
    out_trade_no: searchParams.get('out_trade_no') || '',
    trade_no: searchParams.get('trade_no') || '',
    trade_status: searchParams.get('trade_status') || '',
    total_amount: searchParams.get('total_amount') || '',
  }

  // Validate required parameters
  if (!params.out_trade_no || !params.trade_no) {
    if (process.env.NODE_ENV === 'development') {
    console.error('[alipay/callback] GET: Missing required parameters');
    }
    return NextResponse.redirect(new URL('/orders?error=missing_params', request.url))
  }

  try {
    // Verify callback signature
    const isValid = await verifyAlipayCallback(params)
    if (!isValid) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[alipay/callback] GET: Invalid signature');
      }
      return NextResponse.redirect(new URL('/orders?error=invalid_signature', request.url))
    }

    // Check if payment was already processed (idempotency check)
    // Use service role client for checking payment status
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

    // Check if this payment was already processed
    const { data: existingTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, status, related_id')
      .eq('provider', 'alipay')
      .eq('provider_ref', params.trade_no)
      .maybeSingle()

    // If already processed, redirect to appropriate page
    if (existingTransaction?.status === 'paid') {
      if (process.env.NODE_ENV === 'development') {
      console.log('[alipay/callback] GET: Payment already processed', params.trade_no);
      }
      
      // For orders, redirect to order page
      if (params.out_trade_no.startsWith('order_') || !params.out_trade_no.includes('_')) {
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('id')
          .eq('order_number', params.out_trade_no)
          .maybeSingle()
        
        if (order) {
          return NextResponse.redirect(new URL(`/orders/${order.id}?status=already_paid`, request.url))
        }
      }
      
      // For subscriptions, redirect to subscription management
      if (params.out_trade_no.startsWith('sub_')) {
        return NextResponse.redirect(new URL('/subscription/manage?status=already_paid', request.url))
      }
      
      // Default redirect
      return NextResponse.redirect(new URL('/orders?status=already_paid', request.url))
    }

    // Verify trade status - only redirect if payment was successful
    if (params.trade_status !== 'TRADE_SUCCESS' && params.trade_status !== 'TRADE_FINISHED') {
      if (process.env.NODE_ENV === 'development') {
      console.log('[alipay/callback] GET: Trade not completed', params.trade_status);
      }
      return NextResponse.redirect(new URL('/orders?error=payment_not_completed', request.url))
    }

    // Find order for redirect (do NOT process payment here)
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, payment_status')
      .eq('order_number', params.out_trade_no)
      .maybeSingle()

    if (order) {
      // Check if order is already paid (additional idempotency check)
      if (order.payment_status === 'paid') {
        return NextResponse.redirect(new URL(`/orders/${order.id}?status=success`, request.url))
      }
      
      // Order exists but payment may still be processing
      // POST callback will handle actual payment processing
      return NextResponse.redirect(new URL(`/orders/${order.id}?status=processing`, request.url))
    }

    // For subscriptions, redirect to subscription page
    if (params.out_trade_no.startsWith('sub_')) {
      return NextResponse.redirect(new URL('/subscription/manage?status=processing', request.url))
    }

    // Default redirect
    return NextResponse.redirect(new URL('/orders?status=processing', request.url))
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
    console.error('[alipay/callback] GET: Error processing callback:', error.message);
    }
    return NextResponse.redirect(new URL('/orders?error=processing_failed', request.url))
  }
}

