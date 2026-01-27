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
      console.error('Invalid WeChat Pay callback signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    // Check return code
    if (params.return_code !== 'SUCCESS') {
      console.error('WeChat Pay return code not SUCCESS:', params.return_msg)
      return NextResponse.json({ error: params.return_msg || 'Payment failed' }, { status: 400 })
    }

    // Check result code
    if (params.result_code !== 'SUCCESS') {
      console.error('WeChat Pay result code not SUCCESS:', params.errCodeDes || params.errCode)
      return NextResponse.json({ error: params.errCodeDes || 'Payment failed' }, { status: 400 })
    }

    const { out_trade_no, transaction_id, total_fee } = params
    const successXml =
      '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>'

    // Handle subscription payment (out_trade_no = sub_<subscriptionId>_<timestamp>)
    if (out_trade_no.startsWith('sub_')) {
      const parts = out_trade_no.split('_')
      const subscriptionId = parts[1]
      if (!subscriptionId) {
        return new NextResponse(successXml, { headers: { 'Content-Type': 'application/xml' } })
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

        // Create notification
        const paidAmount = parseFloat(total_fee || '0') / 100
        const reason = (transaction.metadata as any)?.reason || '平台服务费'
        await supabaseAdmin.from('notifications').insert({
          user_id: userId,
          type: 'system',
          title: '平台服务费支付成功',
          content: `您已成功支付平台服务费 ${paidAmount.toFixed(2)} CNY。原因：${reason}`,
          related_type: 'order',
          related_id: transaction.id,
          link: '/orders',
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
        console.error('Deposit lot not found for WeChat notify:', depositLotId)
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
        .update({ status: 'held', held_at: new Date().toISOString() })
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
      .select('id, total_amount, payment_status')
      .eq('order_number', out_trade_no)
      .single()

    if (orderError || !order) {
      console.error('Order not found for WeChat Pay callback:', out_trade_no)
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Check idempotency: Look for existing payment transaction
    const { data: existingTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, status')
      .eq('provider', 'wechat')
      .eq('provider_ref', transaction_id)
      .single()

    if (existingTransaction) {
      if (existingTransaction.status === 'paid') {
        console.log('WeChat Pay payment already processed:', transaction_id)
        return new NextResponse(successXml, {
          headers: { 'Content-Type': 'application/xml' },
        })
      }
      // Update existing transaction
      await supabaseAdmin
        .from('payment_transactions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', existingTransaction.id)
    } else {
      // Verify amount (total_fee is in fen, convert to CNY)
      const paidAmount = parseFloat(total_fee || '0') / 100
      if (Math.abs(paidAmount - order.total_amount) > 0.01) {
        console.error('Amount mismatch:', { paidAmount, orderAmount: order.total_amount })
        return NextResponse.json(
          { error: 'Amount mismatch' },
          { status: 400 }
        )
      }

      // Create new payment transaction record
      await supabaseAdmin.from('payment_transactions').insert({
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
        console.error('Failed to process order payment:', result.error)
      }

      // Update order with payment method
      await supabaseAdmin
        .from('orders')
        .update({
          payment_method: 'wechat',
          payment_intent_id: transaction_id,
        })
        .eq('id', order.id)
    }

    console.log('WeChat Pay payment processed successfully:', {
      orderId: order.id,
      transactionId: transaction_id,
    })

    return new NextResponse(successXml, {
      headers: { 'Content-Type': 'application/xml' },
    })
  } catch (error: any) {
    console.error('WeChat Pay notify error:', {
      message: error.message,
      stack: error.stack,
    })

    return NextResponse.json(
      { error: error.message || 'Failed to process callback' },
      { status: 500 }
    )
  }
}
