import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { updateSellerPayoutEligibility } from '@/lib/payments/update-seller-payout-eligibility'

/**
 * Get platform Stripe webhook secret from database
 * Falls back to environment variable if not found
 */
async function getPlatformStripeWebhookSecret(
  supabaseAdmin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  currency: string = 'USD'
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_platform_payment_account', {
      p_currency: currency,
      p_account_type: 'stripe',
    })

    if (error || !data || data.length === 0) {
      return null
    }

    const account = data[0]
    const accountInfo = account.account_info as any

    // Webhook secret can be stored in account_info
    if (accountInfo?.stripe_webhook_secret) {
      return accountInfo.stripe_webhook_secret
    }

    return null
  } catch (error) {
    console.error('Error getting platform Stripe webhook secret:', error)
    return null
  }
}

/**
 * Get Stripe client instance for webhook verification
 * Uses platform account config if available
 */
async function getStripeClientForWebhook(
  supabaseAdmin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  currency?: string
): Promise<Stripe> {
  let secretKey: string | null = null

  if (currency) {
    const { data, error } = await supabaseAdmin.rpc('get_platform_payment_account', {
      p_currency: currency,
      p_account_type: 'stripe',
    })

    if (!error && data && data.length > 0) {
      const account = data[0]
      const accountInfo = account.account_info as any
      if (accountInfo?.stripe_secret_key) {
        secretKey = accountInfo.stripe_secret_key
      }
    }
  }

  // Fallback to environment variable
  if (!secretKey) {
    secretKey = process.env.STRIPE_SECRET_KEY || null
  }

  if (!secretKey || secretKey.trim() === '') {
    throw new Error('Stripe is not configured')
  }

  return new Stripe(secretKey, {
    apiVersion: '2024-11-20.acacia',
  })
}

export async function POST(request: NextRequest) {
  // Get admin client (per-request, not module-level)
  const supabaseAdmin = await getSupabaseAdmin()
  
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    )
  }

  // Strict webhook signature verification
  // Try to verify signature with all possible webhook secrets
  let event: Stripe.Event | null = null
  let webhookSecret: string | null = null
  let currency: string = 'USD'
  let verificationError: Error | null = null

  // Collect all possible webhook secrets to try
  const secretsToTry: Array<{ secret: string; currency: string; source: string }> = []

  // First, try to get webhook secrets from platform accounts
  const currenciesToTry = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']
  
  for (const curr of currenciesToTry) {
    const secret = await getPlatformStripeWebhookSecret(supabaseAdmin, curr)
    if (secret && secret.trim() !== '') {
      secretsToTry.push({ secret, currency: curr, source: `platform-${curr}` })
    }
  }

  // Add environment variable secret if configured
  const envSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (envSecret && envSecret.trim() !== '') {
    secretsToTry.push({ secret: envSecret, currency: 'USD', source: 'environment' })
  }

  // If no secrets found, reject immediately
  if (secretsToTry.length === 0) {
    console.error('[stripe/webhook] No webhook secrets configured')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  // Try each secret until one succeeds
  for (const { secret, currency: curr, source } of secretsToTry) {
    try {
      event = Stripe.webhooks.constructEvent(body, signature, secret)
      webhookSecret = secret
      currency = curr
      console.log(`[stripe/webhook] Signature verified using ${source} secret for currency ${curr}`)
      break
    } catch (err: any) {
      // Record error but continue trying other secrets
      verificationError = err
      continue
    }
  }

  // If all secrets failed, reject the request
  if (!event) {
    console.error('[stripe/webhook] Signature verification failed for all secrets:', {
      error: verificationError?.message,
      triedSecrets: secretsToTry.length,
      signatureLength: signature?.length || 0,
    })
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 401 }
    )
  }

  // Extract currency from event if available
  if (event && event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.currency) {
      currency = session.currency.toUpperCase()
    }
  }

  // Get Stripe client instance for processing (using the currency we determined)
  const stripe = await getStripeClientForWebhook(supabaseAdmin, currency)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata || {}
        const sessionCurrency = (session.currency || 'USD').toUpperCase()

        // Handle tip payment
        // Handle user direct tip (no post)
        if (metadata.type === 'user_tip' && metadata.userId && metadata.targetUserId) {
          const tipAmount = session.amount_total != null ? session.amount_total / 100 : 0
          const sessionId = session.id

          // Check idempotency
          const { data: existingTransaction } = await supabaseAdmin
            .from('payment_transactions')
            .select('id, status')
            .eq('provider', 'stripe')
            .eq('provider_ref', sessionId)
            .single()

          if (existingTransaction) {
            if (existingTransaction.status === 'paid') {
              console.log('User tip payment already processed:', sessionId)
              break
            }
            await supabaseAdmin
              .from('payment_transactions')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', existingTransaction.id)
          } else {
            await supabaseAdmin.from('payment_transactions').insert({
              type: 'user_tip',
              provider: 'stripe',
              provider_ref: sessionId,
              amount: tipAmount,
              currency: 'CNY',
              status: 'paid',
              related_id: metadata.targetUserId,
              paid_at: new Date().toISOString(),
              metadata: metadata,
            })
          }

          // Use unified service layer to process user tip payment
          const { processUserTipPayment } = await import('@/lib/payments/process-user-tip-payment')
          const result = await processUserTipPayment({
            tipperId: metadata.userId,
            recipientId: metadata.targetUserId,
            amount: tipAmount,
            currency: 'CNY',
            supabaseAdmin,
          })

          if (!result.success) {
            console.error('Failed to process user tip payment:', result.error)
          }
        }
        // Handle post tip
        else if (metadata.type === 'tip' && metadata.userId && metadata.postId && metadata.postAuthorId) {
          const tipAmount = session.amount_total ? session.amount_total / 100 : 0
          const sessionId = session.id

          // Check idempotency: Look for existing payment transaction
          const { data: existingTransaction } = await supabaseAdmin
            .from('payment_transactions')
            .select('id, status')
            .eq('provider', 'stripe')
            .eq('provider_ref', sessionId)
            .single()

          if (existingTransaction) {
            if (existingTransaction.status === 'paid') {
              // Already processed, skip
              console.log('Tip payment already processed:', sessionId)
              break
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
            // Create new payment transaction record (need to get tip id first or use postId as related_id)
            // For tips, we'll use a generated ID or find existing tip
            const { data: existingTip } = await supabaseAdmin
              .from('tips')
              .select('id')
              .eq('post_id', metadata.postId)
              .eq('tipper_id', metadata.userId)
              .eq('payment_method', 'stripe')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            const tipId = existingTip?.id || metadata.postId // Use postId as fallback

            await supabaseAdmin.from('payment_transactions').insert({
              type: 'tip',
              provider: 'stripe',
              provider_ref: sessionId,
              amount: tipAmount,
              currency: 'CNY',
              status: 'paid',
              related_id: tipId,
              paid_at: new Date().toISOString(),
              metadata: metadata,
            })
          }

          // Use unified service layer to process tip payment
          const { processTipPayment } = await import('@/lib/payments/process-tip-payment')
          const result = await processTipPayment({
            postId: metadata.postId,
            tipperId: metadata.userId,
            recipientId: metadata.postAuthorId,
            amount: tipAmount,
            supabaseAdmin,
          })

          if (!result.success) {
            console.error('Failed to process tip payment:', result.error)
          }
        }
        // Handle subscription payment
        else if (metadata.type === 'subscription' && metadata.userId && metadata.subscriptionType) {
          const userId = metadata.userId
          const subscriptionType = metadata.subscriptionType as 'seller' | 'affiliate' | 'tip'
          const currency = session.currency?.toUpperCase() || 'USD'
          const divisor = ['JPY', 'KRW'].includes(currency) ? 1 : 100
          const amount = session.amount_total != null ? session.amount_total / divisor : 0
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          const sessionId = session.id
          const subscriptionTier = metadata.subscriptionTier ? parseFloat(metadata.subscriptionTier) : undefined

          // Check idempotency: Look for existing payment transaction
          const { data: existingTransaction } = await supabaseAdmin
            .from('payment_transactions')
            .select('id, status')
            .eq('provider', 'stripe')
            .eq('provider_ref', sessionId)
            .single()

          if (existingTransaction) {
            if (existingTransaction.status === 'paid') {
              console.log('Subscription payment already processed:', sessionId)
              break
            }
            await supabaseAdmin
              .from('payment_transactions')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', existingTransaction.id)
          } else {
            const { data: existingSub } = await supabaseAdmin
              .from('subscriptions')
              .select('id')
              .eq('user_id', userId)
              .eq('subscription_type', subscriptionType)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            const subscriptionId = existingSub?.id || userId

            await supabaseAdmin.from('payment_transactions').insert({
              type: 'subscription',
              provider: 'stripe',
              provider_ref: sessionId,
              amount,
              currency,
              status: 'paid',
              related_id: subscriptionId,
              paid_at: new Date().toISOString(),
              metadata: metadata,
            })
          }

          const { processSubscriptionPayment } = await import('@/lib/payments/process-subscription-payment')
          const result = await processSubscriptionPayment({
            userId,
            subscriptionType,
            amount,
            expiresAt,
            subscriptionTier,
            currency,
            paymentMethod: 'stripe',
            supabaseAdmin,
          })

          if (!result.success) {
            console.error('Failed to process subscription payment:', result.error)
          }
        }
        // Handle platform fee payment
        else if (metadata.type === 'platform_fee' && metadata.userId && metadata.transactionId) {
          const userId = metadata.userId
          const transactionId = metadata.transactionId
          const sessionId = session.id
          const currency = session.currency?.toUpperCase() || 'USD'
          const divisor = ['JPY', 'KRW'].includes(currency) ? 1 : 100
          const amount = session.amount_total != null ? session.amount_total / divisor : 0

          // Update payment transaction status
          const { error: txError } = await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .eq('id', transactionId)

          if (txError) {
            console.error('Failed to update platform fee transaction:', txError)
          } else {
            // Create notification for user
            await supabaseAdmin.from('notifications').insert({
              user_id: userId,
              type: 'system',
              title: '平台服务费支付成功',
              content: `您已成功支付平台服务费 ${amount.toFixed(2)} ${currency}。原因：${metadata.reason || '平台服务费'}`,
              related_type: 'order',
              related_id: transactionId,
              link: '/orders',
            })
          }
        }
        // Handle deposit payment
        else if (metadata.type === 'deposit' && metadata.userId && metadata.depositLotId) {
          const userId = metadata.userId
          const depositLotId = metadata.depositLotId
          const sessionId = session.id
          const currency = session.currency?.toUpperCase() || 'USD'
          const divisor = ['JPY', 'KRW'].includes(currency) ? 1 : 100
          const amount = session.amount_total != null ? session.amount_total / divisor : 0

          // Check idempotency: Look for existing payment transaction
          const { data: existingTransaction } = await supabaseAdmin
            .from('payment_transactions')
            .select('id, status')
            .eq('provider', 'stripe')
            .eq('provider_ref', sessionId)
            .single()

          if (existingTransaction) {
            if (existingTransaction.status === 'paid') {
              console.log('Deposit payment already processed:', sessionId)
              break
            }
            await supabaseAdmin
              .from('payment_transactions')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', existingTransaction.id)
          } else {
            await supabaseAdmin.from('payment_transactions').insert({
              type: 'deposit',
              provider: 'stripe',
              provider_ref: sessionId,
              amount,
              currency,
              status: 'paid',
              related_id: depositLotId,
              paid_at: new Date().toISOString(),
              metadata: metadata,
            })
          }

          // Update deposit lot status
          const { error: lotError } = await supabaseAdmin
            .from('seller_deposit_lots')
            .update({
              status: 'held',
              held_at: new Date().toISOString(),
            })
            .eq('id', depositLotId)
            .eq('seller_id', userId)

          if (lotError) {
            console.error('Failed to update deposit lot:', lotError)
          } else {
            // Enable seller payment
            const { enableSellerPayment } = await import('@/lib/deposits/payment-control')
            await enableSellerPayment(userId, supabaseAdmin)

            // Create notification for seller
            await supabaseAdmin.from('notifications').insert({
              user_id: userId,
              type: 'system',
              title: '保证金支付成功',
              content: `您的保证金已成功支付，商品销售功能已恢复。`,
              related_id: depositLotId,
              related_type: null,
              link: '/seller/deposit/pay',
            })
          }
        }
        // Handle order payment
        else if (metadata.type === 'order' && metadata.orderId) {
          const orderId = metadata.orderId
          const sessionId = session.id
          // Convert amount based on currency (JPY/KRW don't use decimals)
          const currency = session.currency?.toUpperCase() || 'USD'
          const divisor = ['JPY', 'KRW'].includes(currency) ? 1 : 100
          const amount = session.amount_total ? session.amount_total / divisor : 0

          // Check idempotency: Look for existing payment transaction
          const { data: existingTransaction } = await supabaseAdmin
            .from('payment_transactions')
            .select('id, status')
            .eq('provider', 'stripe')
            .eq('provider_ref', sessionId)
            .single()

          if (existingTransaction) {
            if (existingTransaction.status === 'paid') {
              // Already processed, skip
              console.log('Order payment already processed:', sessionId)
              break
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
            // Get currency from session
            const orderCurrency = session.currency?.toUpperCase() || 'USD'
            
            // Create new payment transaction record
            await supabaseAdmin.from('payment_transactions').insert({
              type: 'order',
              provider: 'stripe',
              provider_ref: sessionId,
              amount: amount,
              currency: orderCurrency,
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

          // Update order with payment method
          await supabaseAdmin
            .from('orders')
            .update({
              payment_method: 'stripe',
            })
            .eq('id', orderId)
        }
        break

      case 'checkout.session.async_payment_succeeded':
        const asyncSession = event.data.object as Stripe.Checkout.Session
        const asyncMetadata = asyncSession.metadata || {}

        if (asyncMetadata.type === 'order' && asyncMetadata.orderId) {
          const asyncOrderId = asyncMetadata.orderId

          // Get order details with total amount
          const { data: asyncOrder } = await supabaseAdmin
            .from('orders')
            .select('id, total_amount, payment_status')
            .eq('id', asyncOrderId)
            .single()

          if (asyncOrder && asyncOrder.payment_status !== 'paid') {
            // Get payment amount from session
            const amount = asyncSession.amount_total ? asyncSession.amount_total / 100 : asyncOrder.total_amount

            // Use unified service layer to process order payment
            // This handles order status update, stock update, notifications (buyer + seller), and commissions
            const { processOrderPayment } = await import('@/lib/payments/process-order-payment')
            const result = await processOrderPayment({
              orderId: asyncOrderId,
              amount,
              supabaseAdmin,
            })

            if (!result.success) {
              console.error('Failed to process async order payment:', result.error)
            }

            // Update order with payment method
            await supabaseAdmin
              .from('orders')
              .update({
                payment_method: 'stripe',
              })
              .eq('id', asyncOrderId)
          }
        }
        break

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        // Get order details with total amount
        const { data: orderForIntent } = await supabaseAdmin
          .from('orders')
          .select('id, total_amount, payment_status')
          .eq('payment_intent_id', paymentIntent.id)
          .single()

        if (orderForIntent && orderForIntent.payment_status !== 'paid') {
          // Get payment amount from payment intent
          const amount = paymentIntent.amount ? paymentIntent.amount / 100 : orderForIntent.total_amount

          // Use unified service layer to process order payment
          // This handles order status update, stock update, notifications (buyer + seller), and commissions
          const { processOrderPayment } = await import('@/lib/payments/process-order-payment')
          const result = await processOrderPayment({
            orderId: orderForIntent.id,
            amount,
            supabaseAdmin,
          })

          if (!result.success) {
            console.error('Failed to process payment intent order payment:', result.error)
          }

          // Update order with payment method
          await supabaseAdmin
            .from('orders')
            .update({
              payment_method: 'stripe',
            })
            .eq('id', orderForIntent.id)
        }
        break

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent
        await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'failed',
          })
          .eq('payment_intent_id', failedPayment.id)
        break

      // ============================================
      // Stripe Connect Account Status Updates
      // ============================================
      case 'account.updated':
        // Handle Stripe Connect account status changes
        // Update provider_* fields (read-only cache) and trigger eligibility recalculation
        const account = event.data.object as Stripe.Account
        const connectAccountId = account.id

        // Find seller by payment_account_id
        const { data: sellerProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('payment_provider', 'stripe')
          .eq('payment_account_id', connectAccountId)
          .maybeSingle()

        if (sellerProfile) {
          // Update provider status (read-only cache)
          const providerAccountStatus = account.charges_enabled && account.payouts_enabled
            ? 'enabled'
            : account.details_submitted
            ? 'pending'
            : 'disabled'

          await supabaseAdmin
            .from('profiles')
            .update({
              provider_charges_enabled: account.charges_enabled || false,
              provider_payouts_enabled: account.payouts_enabled || false,
              provider_account_status: providerAccountStatus,
            })
            .eq('id', sellerProfile.id)

          // Trigger eligibility recalculation (async eventual consistency)
          // Use updateSellerPayoutEligibility service (physical lock)
          updateSellerPayoutEligibility({
            sellerId: sellerProfile.id,
            supabaseAdmin,
          }).catch((error) => {
            console.error('Error updating seller payout eligibility after account.updated:', error)
            // Don't fail webhook, just log error
          })

          console.log('[Webhook] Updated Stripe Connect account status for seller:', sellerProfile.id, {
            accountId: connectAccountId,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            status: providerAccountStatus,
          })
        }
        break

      case 'account.application.deauthorized':
        // Handle account deauthorization
        const deauthorizedAccount = event.data.object as Stripe.Account
        const deauthorizedAccountId = deauthorizedAccount.id

        const { data: deauthorizedSeller } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('payment_provider', 'stripe')
          .eq('payment_account_id', deauthorizedAccountId)
          .maybeSingle()

        if (deauthorizedSeller) {
          // Update provider status to disabled
          await supabaseAdmin
            .from('profiles')
            .update({
              provider_charges_enabled: false,
              provider_payouts_enabled: false,
              provider_account_status: 'disabled',
            })
            .eq('id', deauthorizedSeller.id)

          // Trigger eligibility recalculation
          updateSellerPayoutEligibility({
            sellerId: deauthorizedSeller.id,
            supabaseAdmin,
          }).catch((error) => {
            console.error('Error updating seller payout eligibility after account.application.deauthorized:', error)
          })

          console.log('[Webhook] Account deauthorized for seller:', deauthorizedSeller.id)
        }
        break

      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
