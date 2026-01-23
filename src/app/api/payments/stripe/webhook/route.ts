import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/**
 * Get platform Stripe webhook secret from database
 * Falls back to environment variable if not found
 */
async function getPlatformStripeWebhookSecret(currency: string = 'USD'): Promise<string | null> {
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
async function getStripeClientForWebhook(currency?: string): Promise<Stripe> {
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
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    )
  }

  // First, try to parse the event to get currency from session
  // We'll need to try multiple webhook secrets if we have multiple platform accounts
  let event: Stripe.Event | null = null
  let webhookSecret: string | null = null
  let currency: string = 'USD'

  // Try to get webhook secret from platform accounts
  // For now, try common currencies
  const currenciesToTry = ['USD', 'CNY', 'EUR', 'GBP']
  
  for (const curr of currenciesToTry) {
    const secret = await getPlatformStripeWebhookSecret(curr)
    if (secret) {
      try {
        event = Stripe.webhooks.constructEvent(body, signature, secret)
        webhookSecret = secret
        currency = curr
        break
      } catch (err) {
        // Try next currency
        continue
      }
    }
  }

  // If not found in platform accounts, try environment variable
  if (!event) {
    const envSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (envSecret) {
      try {
        event = Stripe.webhooks.constructEvent(body, signature, envSecret)
        webhookSecret = envSecret
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message)
        return NextResponse.json(
          { error: `Webhook Error: ${err.message}` },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 400 }
      )
    }
  }

  // Extract currency from event if available
  if (event && event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.currency) {
      currency = session.currency.toUpperCase()
    }
  }

  // Get Stripe client instance for processing (using the currency we determined)
  const stripe = await getStripeClientForWebhook(currency)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata || {}
        const sessionCurrency = (session.currency || 'USD').toUpperCase()

        // Handle tip payment
        if (metadata.type === 'tip' && metadata.userId && metadata.postId && metadata.postAuthorId) {
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

          // Get order details
          const { data: asyncOrder } = await supabaseAdmin
            .from('orders')
            .select('buyer_id, product_id, quantity, order_items(product_id, quantity)')
            .eq('id', asyncOrderId)
            .single()

          if (asyncOrder) {
            await supabaseAdmin
              .from('orders')
              .update({
                payment_status: 'paid',
                order_status: 'paid',
              })
              .eq('id', asyncOrderId)

            // Update stock
            if (asyncOrder.order_items && asyncOrder.order_items.length > 0) {
              for (const item of asyncOrder.order_items) {
                const { data: product } = await supabaseAdmin
                  .from('products')
                  .select('stock')
                  .eq('id', item.product_id)
                  .single()

                if (product && product.stock !== null) {
                  const newStock = Math.max(0, (product.stock || 0) - item.quantity)
                  await supabaseAdmin
                    .from('products')
                    .update({ stock: newStock, updated_at: new Date().toISOString() })
                    .eq('id', item.product_id)
                }
              }
            } else if (asyncOrder.product_id) {
              const { data: product } = await supabaseAdmin
                .from('products')
                .select('stock')
                .eq('id', asyncOrder.product_id)
                .single()

              if (product && product.stock !== null) {
                const newStock = Math.max(0, (product.stock || 0) - (asyncOrder.quantity || 1))
                await supabaseAdmin
                  .from('products')
                  .update({ stock: newStock, updated_at: new Date().toISOString() })
                  .eq('id', asyncOrder.product_id)
              }
            }

            // Create notification
            await supabaseAdmin.from('notifications').insert({
              user_id: asyncOrder.buyer_id,
              type: 'order',
              title: '订单支付成功',
              content: `您的订单已成功支付`,
              related_id: asyncOrderId,
              related_type: 'order',
              link: `/orders/${asyncOrderId}`,
            })
          }
        }
        break

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        // Get order details
        const { data: orderForIntent } = await supabaseAdmin
          .from('orders')
          .select('id, buyer_id, product_id, quantity, order_items(product_id, quantity)')
          .eq('payment_intent_id', paymentIntent.id)
          .single()

        if (orderForIntent) {
          // Update order status
          await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'paid',
              order_status: 'paid',
            })
            .eq('id', orderForIntent.id)

          // Update stock for products in order
          if (orderForIntent.order_items && orderForIntent.order_items.length > 0) {
            // Multiple products via order_items
            for (const item of orderForIntent.order_items) {
              const { data: product } = await supabaseAdmin
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .single()

              if (product && product.stock !== null) {
                const newStock = Math.max(0, (product.stock || 0) - item.quantity)
                await supabaseAdmin
                  .from('products')
                  .update({ stock: newStock, updated_at: new Date().toISOString() })
                  .eq('id', item.product_id)
              }
            }
          } else if (orderForIntent.product_id) {
            // Single product (legacy format)
            const { data: product } = await supabaseAdmin
              .from('products')
              .select('stock')
              .eq('id', orderForIntent.product_id)
              .single()

            if (product && product.stock !== null) {
              const newStock = Math.max(0, (product.stock || 0) - (orderForIntent.quantity || 1))
              await supabaseAdmin
                .from('products')
                .update({ stock: newStock, updated_at: new Date().toISOString() })
                .eq('id', orderForIntent.product_id)
            }
          }

          // Create notification
          await supabaseAdmin.from('notifications').insert({
            user_id: orderForIntent.buyer_id,
            type: 'order',
            title: '订单支付成功',
            content: `您的订单已成功支付`,
            related_id: orderForIntent.id,
            related_type: 'order',
            link: `/orders/${orderForIntent.id}`,
          })
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
