import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { capturePayPalOrder, getPayPalOrder } from '@/lib/payments/paypal'
import { getSubscriptionPrice, SELLER_TIERS_USD } from '@/lib/subscriptions/pricing'
import type { SubscriptionType } from '@/lib/subscriptions/pricing'
import type { Currency } from '@/lib/currency/detect-currency'

function roundAmountByCurrency(amount: number, currency: Currency): number {
  const factor = ['JPY', 'KRW'].includes(currency) ? 1 : 100
  return Math.round(amount * factor) / factor
}

export async function POST(request: NextRequest) {
  try {
    // Payment library will check platform account first, then fallback to env vars

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      if (process.env.NODE_ENV === 'development') {
      console.error('PayPal capture auth error:', authError)
;
      }
      // 濡傛灉璁よ瘉閿欒鏄埛鏂颁护鐗岄棶棰橈紝灏濊瘯閲嶆柊璁よ瘉
      if (authError?.message?.includes('Refresh Token')) {
        return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 })
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orderId, sellerId: sellerIdHint } = await request.json()

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing order ID' },
        { status: 400 }
      )
    }

    // Use service role client for ownership checks and processing.
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

    // Load order details before capture so we can validate ownership first.
    let orderDetails: any
    try {
      orderDetails = await getPayPalOrder(orderId, 'USD', sellerIdHint)
    } catch (error) {
      if (!sellerIdHint) {
        throw error
      }
      // Fallback for legacy callers that don't pass sellerId hint.
      orderDetails = await getPayPalOrder(orderId, 'USD')
    }

    const purchaseUnit = orderDetails.purchase_units?.[0]
    const currency = purchaseUnit?.amount?.currency_code?.toUpperCase() || 'USD'
    let metadata: any = {}

    // Parse metadata from custom_id for auth checks and payment routing.
    if (purchaseUnit?.custom_id) {
      try {
        metadata = JSON.parse(purchaseUnit.custom_id)
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
        console.error('Failed to parse PayPal custom_id metadata:', e, 'custom_id:', purchaseUnit.custom_id);
        }
      }
    }

    const paymentType = metadata?.type
    if (!paymentType) {
      if (process.env.NODE_ENV === 'development') {
      console.error('[paypal/capture-order] Missing payment type in metadata:', metadata);
      }
      return NextResponse.json(
        { error: 'Payment type is not defined. Unable to process payment.' },
        { status: 400 }
      )
    }

    const normalizedSellerIdHint =
      typeof sellerIdHint === 'string' && sellerIdHint.trim().length > 0 ? sellerIdHint.trim() : undefined
    const sellerIdFromMetadata =
      typeof metadata?.sellerId === 'string' && metadata.sellerId.trim().length > 0
        ? metadata.sellerId.trim()
        : undefined
    const sellerId = sellerIdFromMetadata || normalizedSellerIdHint

    // SECURITY: verify ownership before capture to prevent unauthorized capture attempts.
    if (metadata.userId && metadata.userId !== user.id) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[paypal/capture-order] User ID mismatch:', {
          expected: metadata.userId,
          actual: user.id,
          paymentType,
        })
      }
      return NextResponse.json(
        { error: 'Unauthorized: User ID mismatch' },
        { status: 403 }
      )
    }

    if (paymentType === 'order') {
      if (!metadata.orderId) {
        return NextResponse.json(
          { error: 'Invalid order metadata: missing orderId' },
          { status: 400 }
        )
      }

      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('buyer_id')
        .eq('id', metadata.orderId)
        .single()

      if (orderError || !orderData) {
        if (process.env.NODE_ENV === 'development') {
        console.error('[paypal/capture-order] Order not found:', metadata.orderId);
        }
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        )
      }

      if (orderData.buyer_id !== user.id) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[paypal/capture-order] Order buyer ID mismatch:', {
            orderId: metadata.orderId,
            expected: orderData.buyer_id,
            actual: user.id,
          })
        }
        return NextResponse.json(
          { error: 'Unauthorized: You are not the buyer of this order' },
          { status: 403 }
        )
      }
    }

    if (paymentType === 'tip' && (!metadata.postId || !metadata.postAuthorId || !metadata.userId)) {
      return NextResponse.json(
        { error: 'Invalid tip metadata' },
        { status: 400 }
      )
    }

    if (paymentType === 'user_tip' && (!metadata.targetUserId || !metadata.userId)) {
      return NextResponse.json(
        { error: 'Invalid user tip metadata' },
        { status: 400 }
      )
    }

    // Capture the order using seller's PayPal config if available
    const capture = await capturePayPalOrder(orderId, currency, sellerId)

    if (capture.status === 'COMPLETED') {
      const captureDetails = capture.purchase_units?.[0]?.payments?.captures?.[0]
      const amount = parseFloat(captureDetails?.amount?.value || '0')

      if (paymentType === 'subscription' && metadata.subscriptionType) {
        const captureId = captureDetails?.id || orderId
        const captureCurrency = (captureDetails?.amount?.currency_code?.toUpperCase() || currency || 'USD') as Currency
        const subscriptionType = metadata.subscriptionType as 'seller' | 'affiliate' | 'tip'
        const subscriptionTier = metadata.subscriptionTier ? parseFloat(metadata.subscriptionTier) : null
        const isFirstMonth = metadata.isFirstMonth === 'true'

        const metadataExpectedCurrency = metadata.expectedCurrency
          ? String(metadata.expectedCurrency).toUpperCase()
          : captureCurrency
        if (metadataExpectedCurrency !== captureCurrency) {
          return NextResponse.json(
            { error: `Currency mismatch: expected ${metadataExpectedCurrency}, got ${captureCurrency}` },
            { status: 400 }
          )
        }

        let expectedAmount = metadata.expectedAmount ? parseFloat(String(metadata.expectedAmount)) : NaN
        if (!Number.isFinite(expectedAmount)) {
          let normalizedTier: number | undefined
          if (subscriptionType === 'seller') {
            normalizedTier = subscriptionTier ?? undefined
            if (!normalizedTier || !SELLER_TIERS_USD.includes(normalizedTier as (typeof SELLER_TIERS_USD)[number])) {
              return NextResponse.json(
                { error: 'Invalid subscription tier' },
                { status: 400 }
              )
            }
          }
          const serverPrice = getSubscriptionPrice(
            subscriptionType as SubscriptionType,
            normalizedTier,
            captureCurrency
          )
          expectedAmount = serverPrice.amount
          if (subscriptionType === 'seller' && isFirstMonth) {
            expectedAmount = roundAmountByCurrency(expectedAmount * 0.5, captureCurrency)
          }
        }
        const amountPrecision = ['JPY', 'KRW'].includes(captureCurrency) ? 0 : 0.02
        if (Math.abs(amount - expectedAmount) > amountPrecision) {
          return NextResponse.json(
            { error: `Amount mismatch: expected ${expectedAmount}, got ${amount}` },
            { status: 400 }
          )
        }

        // Idempotency: prevent duplicate subscription activation on repeated capture requests.
        const { data: existingTransaction, error: existingSubscriptionTxError } = await supabaseAdmin
          .from('payment_transactions')
          .select('id, status')
          .eq('provider', 'paypal')
          .eq('provider_ref', captureId)
          .eq('type', 'subscription')
          .maybeSingle()

        if (existingSubscriptionTxError) {
          return NextResponse.json(
            { error: `Failed to query existing subscription transaction: ${existingSubscriptionTxError.message}` },
            { status: 500 }
          )
        }

        if (existingTransaction?.status === 'paid') {
          if (process.env.NODE_ENV === 'development') {
          console.log('[paypal/capture-order] Subscription payment already processed:', captureId)
;
          }
          return NextResponse.json({
            status: capture.status,
            orderId: capture.id,
          })
        }

        // Handle subscription using unified process-subscription-payment
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

        // Use unified subscription payment processing
        const { processSubscriptionPayment } = await import('@/lib/payments/process-subscription-payment')
        const result = await processSubscriptionPayment({
          userId: user.id,
          subscriptionType,
          amount: amount,
          expiresAt: expiresAt,
          subscriptionTier: subscriptionTier || undefined,
          currency: captureCurrency,
          paymentMethod: 'paypal',
          supabaseAdmin,
          isFirstMonth,
        })

        if (!result.success) {
          return NextResponse.json(
            { error: `Subscription payment captured but processing failed: ${result.error || 'unknown error'}` },
            { status: 500 }
          )
        }

        if (!result.subscriptionId) {
          return NextResponse.json(
            { error: `Missing subscriptionId after subscription payment processing: ${captureId}` },
            { status: 500 }
          )
        }

        if (existingTransaction) {
          const { error: updateSubscriptionTxError } = await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              amount,
              currency: captureCurrency,
              related_id: result.subscriptionId,
              metadata,
            })
            .eq('id', existingTransaction.id)

          if (updateSubscriptionTxError) {
            return NextResponse.json(
              { error: `Failed to update subscription transaction: ${updateSubscriptionTxError.message}` },
              { status: 500 }
            )
          }
        } else {
          const { error: txInsertError } = await supabaseAdmin
            .from('payment_transactions')
            .insert({
              type: 'subscription',
              provider: 'paypal',
              provider_ref: captureId,
              amount: amount,
              currency: captureCurrency,
              status: 'paid',
              related_id: result.subscriptionId,
              paid_at: new Date().toISOString(),
              metadata: metadata,
            })

          if (txInsertError && txInsertError.code !== '23505') {
            return NextResponse.json(
              { error: `Failed to insert subscription transaction: ${txInsertError.message}` },
              { status: 500 }
            )
          }
        }
      } else if (paymentType === 'order' && metadata.orderId) {
        // Handle order
        const orderId = metadata.orderId
        const captureId = captureDetails?.id || orderId // Use capture ID as provider_ref

        // Check idempotency: Look for existing payment transaction
        const { data: existingTransaction, error: existingTransactionError } = await supabaseAdmin
          .from('payment_transactions')
          .select('id, status')
          .eq('provider', 'paypal')
          .eq('provider_ref', captureId)
          .maybeSingle()

        if (existingTransactionError) {
          return NextResponse.json(
            { error: `Failed to query existing order transaction: ${existingTransactionError.message}` },
            { status: 500 }
          )
        }

        if (existingTransaction) {
          if (existingTransaction.status === 'paid') {
            // Already processed, return success (idempotency)
            if (process.env.NODE_ENV === 'development') {
            console.log('Order payment already processed:', captureId)
;
            }
            return NextResponse.json({
              status: capture.status,
              orderId: capture.id,
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
            return NextResponse.json(
              { error: `Failed to update order transaction: ${updateTxError.message}` },
              { status: 500 }
            )
          }
        } else {
          // Get currency from capture details
          const currency = captureDetails?.amount?.currency_code?.toUpperCase() || 'USD'

          // Create new payment transaction record
          const { error: insertTxError } = await supabaseAdmin.from('payment_transactions').insert({
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

          if (insertTxError && insertTxError.code !== '23505') {
            return NextResponse.json(
              { error: `Failed to create order transaction: ${insertTxError.message}` },
              { status: 500 }
            )
          }
        }

        // Use unified service layer to process order payment
        const { processOrderPayment } = await import('@/lib/payments/process-order-payment')
        const result = await processOrderPayment({
          orderId,
          amount,
          supabaseAdmin,
        })

        if (!result.success) {
          return NextResponse.json(
            { error: `Order payment captured but processing failed: ${result.error || 'unknown error'}` },
            { status: 500 }
          )
        }

        // Update order with payment method and capture ID (for refunds)
        const { error: updateOrderError } = await supabaseAdmin
          .from('orders')
          .update({
            payment_method: 'paypal',
            payment_intent_id: captureId,
          })
          .eq('id', orderId)

        if (updateOrderError) {
          return NextResponse.json(
            { error: `Order payment processed but failed to store payment reference: ${updateOrderError.message}` },
            { status: 500 }
          )
        }
      } else if (paymentType === 'user_tip' && metadata.targetUserId) {
        // Handle user tip payment with idempotency check
        const captureId = captureDetails?.id || orderId
        const tipCurrency = currency || 'CNY'

        // Check idempotency: Look for existing payment transaction
        const { data: existingTransaction, error: existingUserTipTxError } = await supabaseAdmin
          .from('payment_transactions')
          .select('id, status')
          .eq('provider', 'paypal')
          .eq('provider_ref', captureId)
          .eq('type', 'user_tip')
          .maybeSingle()

        if (existingUserTipTxError) {
          return NextResponse.json(
            { error: `Failed to query existing user tip transaction: ${existingUserTipTxError.message}` },
            { status: 500 }
          )
        }

        let paymentTransactionId = existingTransaction?.id

        if (existingTransaction) {
          if (existingTransaction.status === 'paid') {
            if (process.env.NODE_ENV === 'development') {
            console.log('[paypal/capture-order] User tip payment already processed:', captureId)
;
            }
            return NextResponse.json({
              status: capture.status,
              orderId: capture.id,
            })
          } else {
            const { error: updateUserTipTxError } = await supabaseAdmin
              .from('payment_transactions')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', existingTransaction.id)

            if (updateUserTipTxError) {
              return NextResponse.json(
                { error: `Failed to update user tip transaction: ${updateUserTipTxError.message}` },
                { status: 500 }
              )
            }
          }
        } else {
          // Create new payment transaction record
          const { data: newTransaction, error: transactionInsertError } = await supabaseAdmin
            .from('payment_transactions')
            .insert({
              type: 'user_tip',
              provider: 'paypal',
              provider_ref: captureId,
              amount: amount,
              currency: tipCurrency,
              status: 'paid',
              related_id: metadata.targetUserId,
              paid_at: new Date().toISOString(),
              metadata: metadata,
            })
            .select('id')
            .single()

          if (transactionInsertError && transactionInsertError.code !== '23505') {
            return NextResponse.json(
              { error: `Failed to insert user tip transaction: ${transactionInsertError.message}` },
              { status: 500 }
            )
          }

          if (transactionInsertError?.code === '23505') {
            const { data: duplicateUserTipTx, error: duplicateUserTipTxQueryError } = await supabaseAdmin
              .from('payment_transactions')
              .select('id')
              .eq('provider', 'paypal')
              .eq('provider_ref', captureId)
              .eq('type', 'user_tip')
              .maybeSingle()

            if (duplicateUserTipTxQueryError) {
              return NextResponse.json(
                { error: `Failed to query duplicated user tip transaction: ${duplicateUserTipTxQueryError.message}` },
                { status: 500 }
              )
            }
            paymentTransactionId = duplicateUserTipTx?.id
          } else {
            paymentTransactionId = newTransaction?.id
          }
        }

        // Use unified service layer to process user tip payment
        const { processUserTipPayment } = await import('@/lib/payments/process-user-tip-payment')
        const tipResult = await processUserTipPayment({
          tipperId: user.id,
          recipientId: metadata.targetUserId,
          amount: amount,
          currency: tipCurrency,
          supabaseAdmin,
          paymentTransactionId,
        })

        if (!tipResult.success) {
          return NextResponse.json(
            { error: `User tip captured but processing failed: ${tipResult.error || 'unknown error'}` },
            { status: 500 }
          )
        }
      } else if (paymentType === 'tip' && metadata.postId && metadata.postAuthorId) {
        // Handle post tip payment with idempotency check
        const captureId = captureDetails?.id || orderId
        const tipCurrency = currency || 'USD'

        // Check idempotency: Look for existing payment transaction
        const { data: existingTransaction, error: existingTipTxError } = await supabaseAdmin
          .from('payment_transactions')
          .select('id, status')
          .eq('provider', 'paypal')
          .eq('provider_ref', captureId)
          .eq('type', 'tip')
          .maybeSingle()

        if (existingTipTxError) {
          return NextResponse.json(
            { error: `Failed to query existing tip transaction: ${existingTipTxError.message}` },
            { status: 500 }
          )
        }

        let paymentTransactionId = existingTransaction?.id

        if (existingTransaction) {
          if (existingTransaction.status === 'paid') {
            if (process.env.NODE_ENV === 'development') {
            console.log('[paypal/capture-order] Tip payment already processed:', captureId)
;
            }
            return NextResponse.json({
              status: capture.status,
              orderId: capture.id,
            })
          } else {
            const { error: updateTipTxError } = await supabaseAdmin
              .from('payment_transactions')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', existingTransaction.id)

            if (updateTipTxError) {
              return NextResponse.json(
                { error: `Failed to update tip transaction: ${updateTipTxError.message}` },
                { status: 500 }
              )
            }
          }
        } else {
          // Create new payment transaction record
          const { data: newTransaction, error: transactionInsertError } = await supabaseAdmin
            .from('payment_transactions')
            .insert({
              type: 'tip',
              provider: 'paypal',
              provider_ref: captureId,
              amount: amount,
              currency: tipCurrency,
              status: 'paid',
              related_id: metadata.postId,
              paid_at: new Date().toISOString(),
              metadata: metadata,
            })
            .select('id')
            .single()

          if (transactionInsertError && transactionInsertError.code !== '23505') {
            return NextResponse.json(
              { error: `Failed to insert tip transaction: ${transactionInsertError.message}` },
              { status: 500 }
            )
          }

          if (transactionInsertError?.code === '23505') {
            const { data: duplicateTipTx, error: duplicateTipTxQueryError } = await supabaseAdmin
              .from('payment_transactions')
              .select('id')
              .eq('provider', 'paypal')
              .eq('provider_ref', captureId)
              .eq('type', 'tip')
              .maybeSingle()

            if (duplicateTipTxQueryError) {
              return NextResponse.json(
                { error: `Failed to query duplicated tip transaction: ${duplicateTipTxQueryError.message}` },
                { status: 500 }
              )
            }
            paymentTransactionId = duplicateTipTx?.id
          } else {
            paymentTransactionId = newTransaction?.id
          }
        }

        // Use unified service layer to process tip payment
        const { processTipPayment } = await import('@/lib/payments/process-tip-payment')
        const tipResult = await processTipPayment({
          postId: metadata.postId,
          tipperId: user.id,
          recipientId: metadata.postAuthorId,
          amount: amount,
          currency: tipCurrency,
          supabaseAdmin,
          paymentTransactionId,
        })

        if (!tipResult.success) {
          return NextResponse.json(
            { error: `Tip payment captured but processing failed: ${tipResult.error || 'unknown error'}` },
            { status: 500 }
          )
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
          if (process.env.NODE_ENV === 'development') {
          console.error('Failed to update platform fee transaction:', txError)
;
          }
        } else {
          // Create notification
          const reason = metadata.reason || 'Platform service fee'
          await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            type: 'system',
            title: 'Platform Service Fee Paid',
            content: `You have successfully paid a platform service fee of ${amount.toFixed(2)} ${currency}. Reason: ${reason}`, 
            related_type: 'order',
            related_id: transactionId,
            link: '/orders',
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
          .update({
            status: 'held',
            held_at: new Date().toISOString(),
            payment_provider: 'paypal',
            payment_session_id: captureId,
          })
          .eq('id', depositLotId)
          .eq('seller_id', userId)

        if (!lotErr) {
          const { enableSellerPayment } = await import('@/lib/deposits/payment-control')
          await enableSellerPayment(userId, supabaseAdmin)
        } else {
          if (process.env.NODE_ENV === 'development') {
          console.error('[paypal/capture-order] Deposit lot update failed:', lotErr)
;
          }
        }
      }
    }

    // For order payments, return the actual order ID (not PayPal order ID) for proper redirect
    const responseData = {
      status: capture.status,
      orderId: paymentType === 'order' && metadata.orderId ? metadata.orderId : capture.id,
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
    console.error('PayPal capture order error:', error)
;
    }
    return NextResponse.json(
      { error: error.message || 'Failed to capture PayPal order' },
      { status: 500 }
    )
  }
}
