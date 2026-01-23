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
        // Handle subscription
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

        // Get subscription tier from metadata
        const subscriptionTier = metadata.subscriptionTier ? parseFloat(metadata.subscriptionTier) : null
        const depositCredit = subscriptionTier || null

        await supabaseAdmin.from('subscriptions').insert({
          user_id: user.id,
          subscription_type: metadata.subscriptionType,
          subscription_tier: subscriptionTier,
          deposit_credit: depositCredit,
          payment_method: 'paypal',
          payment_account_id: captureDetails?.id,
          amount: amount,
          currency: captureDetails?.amount?.currency_code?.toUpperCase() || 'USD',
          status: 'active',
          starts_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        })

        const profileUpdate: any = {
          subscription_type: metadata.subscriptionType,
          subscription_expires_at: expiresAt.toISOString(),
        }

        // For seller subscriptions, update seller_subscription_tier
        if (metadata.subscriptionType === 'seller' && subscriptionTier) {
          profileUpdate.seller_subscription_tier = subscriptionTier
          profileUpdate.role = 'seller'
        }

        // For tip subscriptions, update tip_enabled
        if (metadata.subscriptionType === 'tip') {
          profileUpdate.tip_enabled = true
        }

        await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', user.id)

        // Create notification with appropriate message
        const tierText = subscriptionTier ? ` (${subscriptionTier} USD档位)` : ''
        let subscriptionName = '订阅'
        if (metadata.subscriptionType === 'seller') {
          subscriptionName = '卖家订阅'
        } else if (metadata.subscriptionType === 'affiliate') {
          subscriptionName = '带货者订阅'
        } else if (metadata.subscriptionType === 'tip') {
          subscriptionName = '打赏功能订阅'
        }
        
        await supabaseAdmin.from('notifications').insert({
          user_id: user.id,
          type: 'system',
          title: '订阅激活成功',
          content: `您的${subscriptionName}已成功激活${tierText}`,
          related_type: 'user',
          link: '/subscription/manage',
        })
      } else if (paymentType === 'order' && metadata.orderId) {
        // Handle order
        const orderId = metadata.orderId
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

        // Update order with payment method
        await supabaseAdmin
          .from('orders')
          .update({
            payment_method: 'paypal',
          })
          .eq('id', orderId)
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
