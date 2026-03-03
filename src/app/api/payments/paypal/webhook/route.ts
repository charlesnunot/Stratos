import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { verifyPayPalWebhookSignature } from '@/lib/payments/paypal'

export async function POST(request: NextRequest) {
  let webhookEventRowId: string | null = null
  let supabaseAdmin: any = null

  try {
    const body = await request.text()
    const signature = request.headers.get('paypal-transmission-sig')
    const timestamp = request.headers.get('paypal-transmission-time')
    const webhookId = request.headers.get('paypal-webhook-id')
    const certId = request.headers.get('paypal-cert-id')

    if (process.env.NODE_ENV === 'development') {
      console.log('[paypal/webhook] Received webhook:', {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        hasWebhookId: !!webhookId,
        hasCertId: !!certId,
      })
    }

    if (!signature || !timestamp || !webhookId) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[paypal/webhook] Missing required headers');
      }
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      )
    }

    // ============================================================
    // SECURITY: Verify PayPal webhook signature
    // This prevents attackers from spoofing webhook events
    // ============================================================
    const isValidSignature = await verifyPayPalWebhookSignature(body, {
      'paypal-transmission-sig': signature,
      'paypal-transmission-time': timestamp,
      'paypal-webhook-id': webhookId,
      'paypal-cert-id': certId,
    })

    if (!isValidSignature) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[paypal/webhook] Invalid webhook signature - possible spoofing attempt');
      }
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
    console.log('[paypal/webhook] Signature verified successfully');
    }

    let event: any
    try {
      event = JSON.parse(body)
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[paypal/webhook] Failed to parse webhook body');
      }
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
    console.log('[paypal/webhook] Event type:', event.event_type);
    }

    supabaseAdmin = await getSupabaseAdmin()

    // Phase 0.1: Webhook event idempotency guard.
    const eventId = event?.id
    if (!eventId) {
      return NextResponse.json(
        { error: 'Missing PayPal event id' },
        { status: 400 }
      )
    }
    const { data: insertedWebhookEventId, error: webhookEventError } = await supabaseAdmin.rpc(
      'process_webhook_event',
      {
        p_provider: 'paypal',
        p_event_id: eventId,
        p_event_type: event.event_type || null,
        p_payload: event,
      }
    )
    if (webhookEventError) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[paypal/webhook] Failed to process webhook event:', webhookEventError);
      }
      return NextResponse.json(
        { error: 'Failed to process webhook event' },
        { status: 500 }
      )
    }
    if (insertedWebhookEventId === null) {
      if (process.env.NODE_ENV === 'development') {
      console.log('[paypal/webhook] Duplicate event, skipping:', eventId);
      }
      return NextResponse.json({ received: true, duplicate: true })
    }
    webhookEventRowId = insertedWebhookEventId

    switch (event.event_type) {
      case 'CHECKOUT.ORDER.APPROVED':
        await handleOrderApproved(event, supabaseAdmin)
        break

      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCompleted(event, supabaseAdmin)
        break

      case 'PAYMENT.CAPTURE.DENIED':
        await handlePaymentDenied(event, supabaseAdmin)
        break

      default:
        if (process.env.NODE_ENV === 'development') {
        console.log('[paypal/webhook] Unhandled event type:', event.event_type);
        }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    if (webhookEventRowId && supabaseAdmin) {
      const { error: cleanupError } = await supabaseAdmin
        .from('webhook_events')
        .delete()
        .eq('id', webhookEventRowId)

      if (cleanupError && process.env.NODE_ENV === 'development') {
        console.error('[paypal/webhook] Failed to rollback webhook event row:', cleanupError)
      }
    }

    if (process.env.NODE_ENV === 'development') {
    console.error('[paypal/webhook] Error processing webhook:', error);
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleOrderApproved(event: any, supabaseAdmin: any) {
  if (process.env.NODE_ENV === 'development') {
  console.log('[paypal/webhook] Order approved:', event.resource?.id);
  }
  // For now, we just log this. The actual capture happens via client-side flow
}

async function handlePaymentCompleted(event: any, supabaseAdmin: any) {
  const resource = event.resource
  const orderId = resource.supplementary_data?.custom_id || resource.custom_id
  const captureId = resource.id
  const amount = parseFloat(resource.amount?.value || '0')
  const currency = resource.amount?.currency_code?.toUpperCase() || 'USD'

  if (process.env.NODE_ENV === 'development') {
    console.log('[paypal/webhook] Payment completed:', {
      captureId,
      orderId,
      amount,
      currency,
    })
  }

  // Try to parse custom_id as JSON (metadata)
  let metadata: any = {}
  let paymentType = ''
  let relatedId = ''

  // Try to parse custom_id as JSON metadata
  if (resource.custom_id) {
    try {
      metadata = JSON.parse(resource.custom_id)
      paymentType = metadata.type
      relatedId = metadata.orderId || metadata.postId || metadata.targetUserId || metadata.subscriptionType
    } catch (e) {
      // If not JSON, treat it as a simple order identifier
      if (process.env.NODE_ENV === 'development') {
      console.log('[paypal/webhook] custom_id is not JSON:', resource.custom_id);
      }
    }
  }

  // If we couldn't get metadata from custom_id, try supplementary_data
  if (!paymentType && resource.supplementary_data?.custom_id) {
    const supplementaryCustomId = resource.supplementary_data.custom_id
    try {
      metadata = JSON.parse(supplementaryCustomId)
      paymentType = metadata.type
      relatedId = metadata.orderId || metadata.postId || metadata.targetUserId || metadata.subscriptionType
    } catch (e) {
      // Check if it's a simple format like "tip_xxx"
      if (supplementaryCustomId.startsWith('tip_')) {
        paymentType = 'tip'
        relatedId = supplementaryCustomId.replace('tip_', '')
      } else if (supplementaryCustomId.startsWith('order_')) {
        paymentType = 'order'
        relatedId = supplementaryCustomId.replace('order_', '')
      } else if (supplementaryCustomId.startsWith('subscription_')) {
        paymentType = 'subscription'
        relatedId = supplementaryCustomId.replace('subscription_', '')
      } else if (supplementaryCustomId.startsWith('user_tip_')) {
        paymentType = 'user_tip'
        relatedId = supplementaryCustomId.replace('user_tip_', '')
      }
    }
  }

  // If still no payment type, fail the webhook so it can be retried/investigated.
  if (!paymentType) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[paypal/webhook] Cannot determine payment type:', {
        custom_id: resource.custom_id,
        supplementary_custom_id: resource.supplementary_data?.custom_id,
      })
    }
    throw new Error(`Cannot determine payment type for capture ${captureId}`)
  }

  if (process.env.NODE_ENV === 'development') {
  console.log('[paypal/webhook] Processing payment:', { paymentType, relatedId, metadata });
  }

  // Check idempotency - has this payment already been processed?
  const { data: existingTransaction, error: existingTxQueryError } = await supabaseAdmin
    .from('payment_transactions')
    .select('id, status')
    .eq('provider', 'paypal')
    .eq('provider_ref', captureId)
    .maybeSingle()

  if (existingTxQueryError) {
    throw new Error(`Failed to query existing PayPal transaction: ${existingTxQueryError.message}`)
  }

  if (existingTransaction) {
    if (existingTransaction.status === 'paid') {
      if (process.env.NODE_ENV === 'development') {
      console.log('[paypal/webhook] Payment already processed:', captureId);
      }
      return
    }
    // Update existing transaction
    const { error: updateExistingTxError } = await supabaseAdmin
      .from('payment_transactions')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', existingTransaction.id)

    if (updateExistingTxError) {
      throw new Error(`Failed to update existing PayPal transaction: ${updateExistingTxError.message}`)
    }
  }

  // Get user ID from metadata if available
  const userId = metadata.userId

  if ((paymentType === 'tip' || paymentType === 'user_tip') && !userId) {
    if (process.env.NODE_ENV === 'development') {
    console.error('[paypal/webhook] Missing userId for tip payment:', { paymentType, captureId });
    }
    throw new Error(`Missing userId for ${paymentType} payment: ${captureId}`)
  }

  // Process based on payment type
  if (paymentType === 'order' && relatedId) {
    await processOrderPayment({
      supabaseAdmin,
      orderId: relatedId,
      amount,
      currency,
      captureId,
      metadata,
    })
  } else if (paymentType === 'subscription' && userId) {
    await processSubscriptionPayment({
      supabaseAdmin,
      userId,
      amount,
      currency,
      captureId,
      metadata,
    })
  } else if (paymentType === 'tip' && relatedId) {
    await processTipPayment({
      supabaseAdmin,
      postId: relatedId,
      userId,
      amount,
      currency,
      captureId,
      metadata,
    })
  } else if (paymentType === 'user_tip' && relatedId) {
    await processUserTipPayment({
      supabaseAdmin,
      targetUserId: relatedId,
      userId,
      amount,
      currency,
      captureId,
      metadata,
    })
  }
}

async function handlePaymentDenied(event: any, supabaseAdmin: any) {
  const resource = event.resource
  const captureId = resource.id

  if (process.env.NODE_ENV === 'development') {
  console.log('[paypal/webhook] Payment denied:', captureId);
  }

  // Update transaction status if exists
  const { data: existingTransaction, error: existingDeniedTxQueryError } = await supabaseAdmin
    .from('payment_transactions')
    .select('id, status, metadata')
    .eq('provider', 'paypal')
    .eq('provider_ref', captureId)
    .maybeSingle()

  if (existingDeniedTxQueryError) {
    throw new Error(`Failed to query denied payment transaction: ${existingDeniedTxQueryError.message}`)
  }

  if (existingTransaction) {
    const { error: updateDeniedTxError } = await supabaseAdmin
      .from('payment_transactions')
      .update({
        status: 'failed',
        metadata: { ...existingTransaction.metadata, failure_reason: resource.status_details?.reason },
      })
      .eq('id', existingTransaction.id)

    if (updateDeniedTxError) {
      throw new Error(`Failed to update denied payment transaction: ${updateDeniedTxError.message}`)
    }
  }
}

async function processOrderPayment({
  supabaseAdmin,
  orderId,
  amount,
  currency,
  captureId,
  metadata,
}: {
  supabaseAdmin: any
  orderId: string
  amount: number
  currency: string
  captureId: string
  metadata: any
}) {
  // Create transaction record
  const { error: insertTxError } = await supabaseAdmin.from('payment_transactions').insert({
    type: 'order',
    provider: 'paypal',
    provider_ref: captureId,
    amount,
    currency,
    status: 'paid',
    related_id: orderId,
    paid_at: new Date().toISOString(),
    metadata,
  })

  if (insertTxError && insertTxError.code !== '23505') {
    throw new Error(`Failed to create PayPal order payment transaction: ${insertTxError.message}`)
  }

  // Process order payment
  const { processOrderPayment } = await import('@/lib/payments/process-order-payment')
  const result = await processOrderPayment({
    orderId,
    amount,
    supabaseAdmin,
  })

  if (!result.success) {
    throw new Error(`Failed to process PayPal order payment: ${result.error || 'unknown error'}`)
  }

  const { error: updateOrderError } = await supabaseAdmin
    .from('orders')
    .update({
      payment_method: 'paypal',
      payment_intent_id: captureId,
    })
    .eq('id', orderId)

  if (updateOrderError) {
    throw new Error(`Failed to update order payment reference: ${updateOrderError.message}`)
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[paypal/webhook] Order payment processed successfully:', orderId)
  }
}

async function processSubscriptionPayment({
  supabaseAdmin,
  userId,
  amount,
  currency,
  captureId,
  metadata,
}: {
  supabaseAdmin: any
  userId: string
  amount: number
  currency: string
  captureId: string
  metadata: any
}) {
  const subscriptionType = metadata.subscriptionType
  const subscriptionTier = metadata.subscriptionTier ? parseFloat(metadata.subscriptionTier) : null
  const isFirstMonth = metadata.isFirstMonth === 'true'
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const normalizedCurrency = (currency?.toUpperCase() || 'USD')

  if (metadata.expectedCurrency && String(metadata.expectedCurrency).toUpperCase() !== normalizedCurrency) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[paypal/webhook] Subscription currency mismatch', {
        expected: metadata.expectedCurrency,
        actual: normalizedCurrency,
        captureId,
      })
    }
    throw new Error(`Subscription currency mismatch for capture ${captureId}`)
  }
  if (metadata.expectedAmount != null) {
    const expectedAmount = parseFloat(String(metadata.expectedAmount))
    if (Number.isFinite(expectedAmount)) {
      const tolerance = ['JPY', 'KRW'].includes(normalizedCurrency) ? 0 : 0.02
      if (Math.abs(amount - expectedAmount) > tolerance) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[paypal/webhook] Subscription amount mismatch', {
            expected: expectedAmount,
            actual: amount,
            currency: normalizedCurrency,
            captureId,
          })
        }
        throw new Error(`Subscription amount mismatch for capture ${captureId}`)
      }
    }
  }

  const { data: existingTransaction, error: existingSubscriptionTxQueryError } = await supabaseAdmin
    .from('payment_transactions')
    .select('id, status')
    .eq('provider', 'paypal')
    .eq('provider_ref', captureId)
    .eq('type', 'subscription')
    .maybeSingle()

  if (existingSubscriptionTxQueryError) {
    throw new Error(
      `Failed to query existing subscription transaction: ${existingSubscriptionTxQueryError.message}`
    )
  }

  if (existingTransaction?.status === 'paid') {
    if (process.env.NODE_ENV === 'development') {
    console.log('[paypal/webhook] Subscription payment already processed:', captureId);
    }
    return
  }

  // Process subscription payment
  const { processSubscriptionPayment } = await import('@/lib/payments/process-subscription-payment')
  const result = await processSubscriptionPayment({
    userId,
    subscriptionType: subscriptionType as 'seller' | 'affiliate' | 'tip',
    amount,
    expiresAt,
    subscriptionTier: subscriptionTier || undefined,
    currency: normalizedCurrency,
    supabaseAdmin,
    isFirstMonth,
  })

  if (!result.success) {
    throw new Error(`Failed to process subscription payment: ${result.error || 'unknown error'}`)
  }

  if (!result.subscriptionId) {
    throw new Error(`Missing subscriptionId after subscription payment processing: ${captureId}`)
  }

  const txPayload = {
    status: 'paid',
    paid_at: new Date().toISOString(),
    amount,
    currency: normalizedCurrency,
    related_id: result.subscriptionId,
    metadata,
  }

  if (existingTransaction) {
    const { error: updateSubscriptionTxError } = await supabaseAdmin
      .from('payment_transactions')
      .update(txPayload)
      .eq('id', existingTransaction.id)

    if (updateSubscriptionTxError) {
      throw new Error(`Failed to update subscription transaction: ${updateSubscriptionTxError.message}`)
    }
  } else {
    const { error: insertSubscriptionTxError } = await supabaseAdmin.from('payment_transactions').insert({
      type: 'subscription',
      provider: 'paypal',
      provider_ref: captureId,
      ...txPayload,
    })

    if (insertSubscriptionTxError && insertSubscriptionTxError.code !== '23505') {
      throw new Error(`Failed to insert subscription transaction: ${insertSubscriptionTxError.message}`)
    }
  }

  if (process.env.NODE_ENV === 'development') {
  console.log('[paypal/webhook] Subscription payment processed successfully:', userId);
  }
}

async function processTipPayment({
  supabaseAdmin,
  postId,
  userId,
  amount,
  currency,
  captureId,
  metadata,
}: {
  supabaseAdmin: any
  postId: string
  userId?: string
  amount: number
  currency: string
  captureId: string
  metadata: any
}) {
  const postAuthorId = metadata.postAuthorId

  if (!postAuthorId) {
    if (process.env.NODE_ENV === 'development') {
    console.error('[paypal/webhook] Missing postAuthorId for tip payment');
    }
    throw new Error(`Missing postAuthorId for tip payment: ${captureId}`)
  }

  let paymentTransactionId: string | undefined
  const { data: insertedTipTx, error: insertTipTxError } = await supabaseAdmin
    .from('payment_transactions')
    .insert({
      type: 'tip',
      provider: 'paypal',
      provider_ref: captureId,
      amount,
      currency,
      status: 'paid',
      related_id: postId,
      paid_at: new Date().toISOString(),
      metadata,
    })
    .select('id')
    .single()

  if (insertTipTxError && insertTipTxError.code !== '23505') {
    throw new Error(`Failed to insert tip payment transaction: ${insertTipTxError.message}`)
  }

  if (insertTipTxError?.code === '23505') {
    const { data: duplicateTipTx, error: duplicateTipTxQueryError } = await supabaseAdmin
      .from('payment_transactions')
      .select('id')
      .eq('provider', 'paypal')
      .eq('provider_ref', captureId)
      .eq('type', 'tip')
      .maybeSingle()

    if (duplicateTipTxQueryError) {
      throw new Error(`Failed to query duplicated tip payment transaction: ${duplicateTipTxQueryError.message}`)
    }
    paymentTransactionId = duplicateTipTx?.id
  } else {
    paymentTransactionId = insertedTipTx?.id
  }

  // Process tip payment
  const { processTipPayment } = await import('@/lib/payments/process-tip-payment')
  const result = await processTipPayment({
    postId,
    tipperId: userId || 'unknown',
    recipientId: postAuthorId,
    amount,
    currency,
    supabaseAdmin,
    paymentTransactionId,
  })

  if (!result.success) {
    throw new Error(`Failed to process tip payment: ${result.error || 'unknown error'}`)
  }

  if (process.env.NODE_ENV === 'development') {
  console.log('[paypal/webhook] Tip payment processed successfully:', postId);
  }
}

async function processUserTipPayment({
  supabaseAdmin,
  targetUserId,
  userId,
  amount,
  currency,
  captureId,
  metadata,
}: {
  supabaseAdmin: any
  targetUserId: string
  userId?: string
  amount: number
  currency: string
  captureId: string
  metadata: any
}) {
  let paymentTransactionId: string | undefined
  const { data: insertedUserTipTx, error: insertUserTipTxError } = await supabaseAdmin
    .from('payment_transactions')
    .insert({
      type: 'user_tip',
      provider: 'paypal',
      provider_ref: captureId,
      amount,
      currency,
      status: 'paid',
      related_id: targetUserId,
      paid_at: new Date().toISOString(),
      metadata,
    })
    .select('id')
    .single()

  if (insertUserTipTxError && insertUserTipTxError.code !== '23505') {
    throw new Error(`Failed to insert user tip payment transaction: ${insertUserTipTxError.message}`)
  }

  if (insertUserTipTxError?.code === '23505') {
    const { data: duplicateUserTipTx, error: duplicateUserTipTxQueryError } = await supabaseAdmin
      .from('payment_transactions')
      .select('id')
      .eq('provider', 'paypal')
      .eq('provider_ref', captureId)
      .eq('type', 'user_tip')
      .maybeSingle()

    if (duplicateUserTipTxQueryError) {
      throw new Error(
        `Failed to query duplicated user tip payment transaction: ${duplicateUserTipTxQueryError.message}`
      )
    }
    paymentTransactionId = duplicateUserTipTx?.id
  } else {
    paymentTransactionId = insertedUserTipTx?.id
  }

  // Process user tip payment
  const { processUserTipPayment } = await import('@/lib/payments/process-user-tip-payment')
  const result = await processUserTipPayment({
    tipperId: userId || 'unknown',
    recipientId: targetUserId,
    amount,
    currency,
    supabaseAdmin,
    paymentTransactionId,
  })

  if (!result.success) {
    throw new Error(`Failed to process user tip payment: ${result.error || 'unknown error'}`)
  }

  if (process.env.NODE_ENV === 'development') {
  console.log('[paypal/webhook] User tip payment processed successfully:', targetUserId);
  }
}
