import { NextRequest, NextResponse } from 'next/server'
import { verifyWeChatPayNotify, type WeChatPayNotifyParams } from '@/lib/payments/wechat'
import { processOrderPayment } from '@/lib/payments/process-order-payment'

export async function POST(request: NextRequest) {
  try {
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

    // WeChat Pay sends XML data
    const bodyText = await request.text()
    
    // Parse XML response (simple regex-based parser)
    const parseWeChatPayXML = (xml: string): Record<string, string> => {
      const result: Record<string, string> = {}
      const matches = xml.matchAll(/<(\w+)><!\[CDATA\[([^\]]+)\]\]><\/\1>/g)
      for (const match of matches) {
        result[match[1]] = match[2]
      }
      // Also try non-CDATA format
      if (Object.keys(result).length === 0) {
        const simpleMatches = xml.matchAll(/<(\w+)>([^<]+)<\/\1>/g)
        for (const match of simpleMatches) {
          result[match[1]] = match[2]
        }
      }
      return result
    }

    const params = parseWeChatPayXML(bodyText) as unknown as WeChatPayNotifyParams

    // Verify signature
    if (!(await verifyWeChatPayNotify(params))) {
      if (process.env.NODE_ENV === 'development') {
      console.error('Invalid WeChat Pay callback signature');
      }
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    // Check return code
    if (params.return_code !== 'SUCCESS') {
      if (process.env.NODE_ENV === 'development') {
      console.error('WeChat Pay return code not SUCCESS:', params.return_msg);
      }
      return NextResponse.json({ error: params.return_msg || 'Payment failed' }, { status: 400 })
    }

    // Check result code
    if (params.result_code !== 'SUCCESS') {
      if (process.env.NODE_ENV === 'development') {
      console.error('WeChat Pay result code not SUCCESS:', params.err_code_des || params.err_code);
      }
      return NextResponse.json({ error: params.err_code_des || 'Payment failed' }, { status: 400 })
    }

    const { out_trade_no, transaction_id, total_fee } = params
    if (!out_trade_no) {
      if (process.env.NODE_ENV === 'development') {
      console.error('WeChat Pay notify missing out_trade_no');
      }
      return NextResponse.json({ error: 'Missing out_trade_no' }, { status: 400 })
    }

    // Phase 0.1: Webhook event idempotency guard using transaction_id as unique event ID
    if (!transaction_id) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[wechat/notify] Missing transaction_id for idempotency check');
      }
      return NextResponse.json({ error: 'Missing transaction_id' }, { status: 400 })
    }
    const { data: webhookEventId, error: webhookEventError } = await supabaseAdmin.rpc(
      'process_webhook_event',
      {
        p_provider: 'wechat',
        p_event_id: transaction_id,
        p_event_type: params.result_code || 'notify',
        p_payload: { out_trade_no, transaction_id, total_fee, result_code: params.result_code },
      }
    )
    if (webhookEventError) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[wechat/notify] Failed to process webhook event:', webhookEventError);
      }
      return NextResponse.json(
        { error: 'Failed to process webhook event' },
        { status: 500 }
      )
    }
    if (webhookEventId === null) {
      if (process.env.NODE_ENV === 'development') {
      console.log('[wechat/notify] Duplicate event, skipping:', transaction_id);
      }
      const successXml =
        '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>'
      return new NextResponse(successXml, { headers: { 'Content-Type': 'application/xml' } })
    }

    // Callback audit log (non-blocking).
    try {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'wechat_notify',
        resourceId: transaction_id || out_trade_no,
        resourceType: 'payment_callback',
        result: 'success',
        timestamp: new Date().toISOString(),
        meta: { out_trade_no, total_fee },
      })
    } catch (_) {
      // Ignore audit log failures so payment callback can continue.
    }

    const successXml =
      '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>'
    const failXml =
      '<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[PROCESSING_ERROR]]></return_msg></xml>'

    // Handle subscription payment (out_trade_no = sub_<subscriptionId>_<timestamp>)
    if (out_trade_no.startsWith('sub_')) {
      const parts = out_trade_no.split('_')
      const subscriptionId = parts[1]
      if (!subscriptionId) {
        return new NextResponse(successXml, { headers: { 'Content-Type': 'application/xml' } })
      }
      if (!transaction_id) {
        if (process.env.NODE_ENV === 'development') {
        console.error('WeChat Pay notify subscription missing transaction_id');
        }
        return NextResponse.json({ error: 'Missing transaction_id' }, { status: 400 })
      }
      const paidAmount = parseFloat(total_fee || '0') / 100
      const { activatePendingSubscription } = await import('@/lib/payments/process-subscription-payment')
      const result = await activatePendingSubscription({
        subscriptionId,
        provider: 'wechat',
        providerRef: transaction_id,
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
      return new NextResponse(successXml, { headers: { 'Content-Type': 'application/xml' } })
    }

    // Handle platform fee payment (out_trade_no = platform_fee_<userId>_<timestamp>)
    if (out_trade_no.startsWith('platform_fee_')) {
      const parts = out_trade_no.split('_')
      const userId = parts[2] // platform_fee_<userId>_<timestamp>
      if (!userId) {
        return new NextResponse(successXml, { headers: { 'Content-Type': 'application/xml' } })
      }
      
      // Find payment transaction
      const { data: transaction } = await supabaseAdmin
        .from('payment_transactions')
        .select('id, related_id, amount, currency, metadata')
        .eq('type', 'order')
        .eq('related_id', userId)
        .contains('metadata', { type: 'platform_fee' })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (transaction) {
        // Update transaction status
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            provider_ref: transaction_id,
          })
          .eq('id', transaction.id)

        // Create notification (use content_key for i18n)
        const paidAmount = parseFloat(total_fee || '0') / 100
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
      return new NextResponse(successXml, { headers: { 'Content-Type': 'application/xml' } })
    }

    // Handle deposit payment (out_trade_no = deposit_<lotId>_<timestamp>)
    if (out_trade_no.startsWith('deposit_')) {
      const parts = out_trade_no.split('_')
      const depositLotId = parts[1]
      if (!depositLotId) {
        return new NextResponse(successXml, {
          headers: { 'Content-Type': 'application/xml' },
        })
      }
      const { data: lot } = await supabaseAdmin
        .from('seller_deposit_lots')
        .select('id, seller_id, required_amount')
        .eq('id', depositLotId)
        .single()

      if (!lot) {
        if (process.env.NODE_ENV === 'development') {
        console.error('Deposit lot not found for WeChat notify:', depositLotId);
        }
        return new NextResponse(successXml, {
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      const paidAmount = parseFloat(total_fee || '0') / 100
      const { data: existingTx } = await supabaseAdmin
        .from('payment_transactions')
        .select('id, status')
        .eq('provider', 'wechat')
        .eq('provider_ref', transaction_id)
        .eq('type', 'deposit')
        .eq('related_id', depositLotId)
        .maybeSingle()

      if (existingTx?.status === 'paid') {
        return new NextResponse(successXml, {
          headers: { 'Content-Type': 'application/xml' },
        })
      }
      if (!existingTx) {
        await supabaseAdmin.from('payment_transactions').insert({
          type: 'deposit',
          provider: 'wechat',
          provider_ref: transaction_id,
          amount: paidAmount,
          currency: 'CNY',
          status: 'paid',
          related_id: depositLotId,
          paid_at: new Date().toISOString(),
          metadata: params,
        })
      } else {
        await supabaseAdmin
          .from('payment_transactions')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', existingTx.id)
      }

      await supabaseAdmin
        .from('seller_deposit_lots')
        .update({ status: 'held', held_at: new Date().toISOString(), payment_provider: 'wechat', payment_session_id: transaction_id })
        .eq('id', depositLotId)
        .eq('seller_id', lot.seller_id)

      const { enableSellerPayment } = await import('@/lib/deposits/payment-control')
      await enableSellerPayment(lot.seller_id, supabaseAdmin)
      return new NextResponse(successXml, {
        headers: { 'Content-Type': 'application/xml' },
      })
    }

    // Find order by order number
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, payment_status, currency')
      .eq('order_number', out_trade_no)
      .single()

    if (orderError || !order) {
      if (process.env.NODE_ENV === 'development') {
      console.error('Order not found for WeChat Pay callback:', out_trade_no);
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
      .eq('provider', 'wechat')
      .eq('provider_ref', transaction_id)
      .maybeSingle()

    if (existingTransactionError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to query existing WeChat payment transaction:', existingTransactionError)
      }
      return new NextResponse(failXml, {
        status: 500,
        headers: { 'Content-Type': 'application/xml' },
      })
    }

    if (existingTransaction) {
      if (existingTransaction.status === 'paid') {
        if (process.env.NODE_ENV === 'development') {
        console.log('WeChat Pay payment already processed:', transaction_id);
        }
        return new NextResponse(successXml, {
          headers: { 'Content-Type': 'application/xml' },
        })
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
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to update WeChat payment transaction:', updateTxError)
        }
        return new NextResponse(failXml, {
          status: 500,
          headers: { 'Content-Type': 'application/xml' },
        })
      }
    } else {
      // Verify amount with currency-based precision (total_fee is in fen, convert to CNY)
      const paidAmount = parseFloat(total_fee || '0') / 100
      const orderCurrency = order.currency?.toUpperCase() || 'CNY'
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
        provider: 'wechat',
        provider_ref: transaction_id,
        amount: paidAmount,
        currency: 'CNY',
        status: 'paid',
        related_id: order.id,
        paid_at: new Date().toISOString(),
        metadata: params,
      })

      if (insertTxError && insertTxError.code !== '23505') {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to create WeChat payment transaction:', insertTxError)
        }
        return new NextResponse(failXml, {
          status: 500,
          headers: { 'Content-Type': 'application/xml' },
        })
      }
    }

    // Check if order is already paid
    if (order.payment_status !== 'paid') {
      // Use unified service layer to process order payment
      const paidAmount = parseFloat(total_fee || '0') / 100
      const result = await processOrderPayment({
        orderId: order.id,
        amount: paidAmount,
        supabaseAdmin,
      })

      if (!result.success) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to process order payment:', result.error)
        }
        return new NextResponse(failXml, {
          status: 500,
          headers: { 'Content-Type': 'application/xml' },
        })
      }

      // Update order with payment method
      const { error: updateOrderError } = await supabaseAdmin
        .from('orders')
        .update({
          payment_method: 'wechat',
          payment_intent_id: transaction_id,
        })
        .eq('id', order.id)

      if (updateOrderError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to update WeChat order payment reference:', updateOrderError)
        }
        return new NextResponse(failXml, {
          status: 500,
          headers: { 'Content-Type': 'application/xml' },
        })
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('WeChat Pay payment processed successfully:', {
        orderId: order.id,
        transactionId: transaction_id,
      })
    }

    return new NextResponse(successXml, {
      headers: { 'Content-Type': 'application/xml' },
    })
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('WeChat Pay notify error:', {
        message: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process callback' },
      { status: 500 }
    )
  }
}

