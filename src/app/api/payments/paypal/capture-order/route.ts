import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { capturePayPalOrder, getPayPalOrder } from '@/lib/payments/paypal'

export async function POST(request: NextRequest) {
  try {
    // Payment library will check platform account first, then fallback to env vars

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing order ID' },
        { status: 400 }
      )
    }

    // Get order details first to extract metadata and currency
    // We'll use USD as default, then update if we get actual currency
    const orderDetails = await getPayPalOrder(orderId, 'USD')
    const purchaseUnit = orderDetails.purchase_units?.[0]
    const currency = purchaseUnit?.amount?.currency_code?.toUpperCase() || 'USD'
    let metadata: any = {}
    
    // Try to parse metadata from custom_id
    if (purchaseUnit?.custom_id) {
      try {
        metadata = JSON.parse(purchaseUnit.custom_id)
      } catch (e) {
        console.error('Failed to parse PayPal custom_id metadata:', e)
      }
    }

    // Capture the order
    const capture = await capturePayPalOrder(orderId, currency)

    if (capture.status === 'COMPLETED') {
      const captureDetails = capture.purchase_units?.[0]?.payments?.captures?.[0]
      const amount = parseFloat(captureDetails?.amount?.value || '0')

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

      // Handle different payment types based on metadata
      // Try to get type from parsed metadata first
      const paymentType = metadata.type

      if (paymentType === 'subscription' && metadata.subscriptionType) {
        // Handle subscription using unified process-subscription-payment
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

        // Get subscription tier from metadata
        const subscriptionTier = metadata.subscriptionTier ? parseFloat(metadata.subscriptionTier) : null

        // Use unified subscription payment processing
        const { processSubscriptionPayment } = await import('@/lib/payments/process-subscription-payment')
        const result = await processSubscriptionPayment({
          userId: user.id,
          subscriptionType: metadata.subscriptionType as 'seller' | 'affiliate' | 'tip',
          amount: amount,
          expiresAt: expiresAt,
          subscriptionTier: subscriptionTier || undefined,
          currency: captureDetails?.amount?.currency_code?.toUpperCase() || 'USD',
          paymentMethod: 'paypal',
          supabaseAdmin,
        })

        if (!result.success) {
          console.error('[paypal/capture-order] Subscription payment processing failed:', result.error)
          // Continue - subscription record may have been created, but profile sync failed
          // This is logged but doesn't fail the PayPal capture
        }
      } else if (paymentType === 'order' && metadata.orderId) {
        // Handle order: 校验订单归属，避免用户 B 操作用户 A 的订单支付
        const ourOrderId = metadata.orderId
        const { data: orderRow, error: orderErr } = await supabaseAdmin
          .from('orders')
          .select('id, buyer_id')
          .eq('id', ourOrderId)
          .single()

        if (orderErr || !orderRow) {
          const { logAudit } = await import('@/lib/api/audit')
          logAudit({
            action: 'paypal_capture_order',
            userId: user.id,
            resourceId: ourOrderId,
            resourceType: 'order',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { reason: 'order_not_found' },
          })
          return NextResponse.json(
            { error: 'Order not found' },
            { status: 404 }
          )
        }

        if (orderRow.buyer_id !== user.id) {
          const { logAudit } = await import('@/lib/api/audit')
          logAudit({
            action: 'paypal_capture_order',
            userId: user.id,
            resourceId: ourOrderId,
            resourceType: 'order',
            result: 'forbidden',
            timestamp: new Date().toISOString(),
            meta: { reason: 'order_buyer_mismatch' },
          })
          return NextResponse.json(
            { error: 'Not your order' },
            { status: 403 }
          )
        }

        const orderId = ourOrderId
        const captureId = captureDetails?.id || orderId // Use capture ID as provider_ref

        // Check idempotency: Look for existing payment transaction
        const { data: existingTransaction } = await supabaseAdmin
          .from('payment_transactions')
          .select('id, status')
          .eq('provider', 'paypal')
          .eq('provider_ref', captureId)
          .single()

        if (existingTransaction) {
          if (existingTransaction.status === 'paid') {
            // Already processed, return success (idempotency)
            console.log('Order payment already processed:', captureId)
            return NextResponse.json({
              status: capture.status,
              orderId: capture.id,
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
          // Get currency from capture details
          const currency = captureDetails?.amount?.currency_code?.toUpperCase() || 'USD'

          // Create new payment transaction record
          await supabaseAdmin.from('payment_transactions').insert({
            type: 'order',
            provider: 'paypal',
            provider_ref: captureId,
            amount: amount,
            currency: currency,
            status: 'paid',
            related_id: orderId,
            paid_at: new Date().toISOString(),
            metadata: metadata,
          })
        }

        // Use unified service layer to process order payment
        const { processOrderPayment } = await import('@/lib/payments/process-order-payment')
        const result = await processOrderPayment({
          orderId,
          amount,
          supabaseAdmin,
        })

        if (!result.success) {
          console.error('Failed to process order payment:', result.error)
        }

        // Update order with payment method and capture ID (for refunds)
        await supabaseAdmin
          .from('orders')
          .update({
            payment_method: 'paypal',
            payment_intent_id: captureId,
          })
          .eq('id', orderId)
      } else if (paymentType === 'user_tip' && metadata.targetUserId) {
        // Use unified service layer to process user tip payment
        const { processUserTipPayment } = await import('@/lib/payments/process-user-tip-payment')
        const tipResult = await processUserTipPayment({
          tipperId: user.id,
          recipientId: metadata.targetUserId,
          amount: amount,
          currency: currency || 'CNY',
          supabaseAdmin,
        })

        if (!tipResult.success) {
          console.error('Failed to process user tip payment:', tipResult.error)
        }
      } else if (paymentType === 'tip' && metadata.postId && metadata.postAuthorId) {
        // Use unified service layer to process tip payment
        const { processTipPayment } = await import('@/lib/payments/process-tip-payment')
        const tipResult = await processTipPayment({
          postId: metadata.postId,
          tipperId: user.id,
          recipientId: metadata.postAuthorId,
          amount: amount,
          currency: currency || 'USD',
          supabaseAdmin,
        })

        if (!tipResult.success) {
          console.error('Failed to process tip payment:', tipResult.error)
        }
      } else if (paymentType === 'platform_fee' && metadata.userId && metadata.transactionId) {
        // Handle platform fee payment
        const userId = metadata.userId
        const transactionId = metadata.transactionId
        const captureId = captureDetails?.id || orderId

        // Update payment transaction status
        const { error: txError } = await supabaseAdmin
          .from('payment_transactions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            provider_ref: captureId,
          })
          .eq('id', transactionId)

        if (txError) {
          console.error('Failed to update platform fee transaction:', txError)
        } else {
          // Create notification (use content_key for i18n)
          const reason = metadata.reason || 'Platform service fee'
          await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            type: 'system',
            title: 'Platform Fee Payment Successful',
            content: `Platform fee of ${amount.toFixed(2)} ${currency} paid successfully.`,
            related_type: 'order',
            related_id: transactionId,
            link: '/orders',
            content_key: 'platform_fee_paid',
            content_params: { amount: amount.toFixed(2), currency, reason },
          })
        }
      } else if (paymentType === 'deposit' && metadata.depositLotId && metadata.userId) {
        // Handle deposit payment
        const depositLotId = metadata.depositLotId
        const userId = metadata.userId
        const captureId = captureDetails?.id || orderId
        const curr = captureDetails?.amount?.currency_code?.toUpperCase() || 'USD'

        const { data: existingTx } = await supabaseAdmin
          .from('payment_transactions')
          .select('id, status')
          .eq('provider', 'paypal')
          .eq('provider_ref', captureId)
          .eq('type', 'deposit')
          .eq('related_id', depositLotId)
          .maybeSingle()

        if (existingTx?.status === 'paid') {
          // Idempotent
        } else if (!existingTx) {
          await supabaseAdmin.from('payment_transactions').insert({
            type: 'deposit',
            provider: 'paypal',
            provider_ref: captureId,
            amount,
            currency: curr,
            status: 'paid',
            related_id: depositLotId,
            paid_at: new Date().toISOString(),
            metadata,
          })
        } else {
          await supabaseAdmin
            .from('payment_transactions')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', existingTx.id)
        }

        const { error: lotErr } = await supabaseAdmin
          .from('seller_deposit_lots')
          .update({ status: 'held', held_at: new Date().toISOString() })
          .eq('id', depositLotId)
          .eq('seller_id', userId)

        if (!lotErr) {
          const { enableSellerPayment } = await import('@/lib/deposits/payment-control')
          await enableSellerPayment(userId, supabaseAdmin)
        } else {
          console.error('[paypal/capture-order] Deposit lot update failed:', lotErr)
        }
      }
    }

    return NextResponse.json({
      status: capture.status,
      orderId: capture.id,
    })
  } catch (error: any) {
    console.error('PayPal capture order error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to capture PayPal order' },
      { status: 500 }
    )
  }
}
