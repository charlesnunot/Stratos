import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPaymentIntent } from '@/lib/payments/stripe'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount, orderId, currency = 'cny' } = await request.json()

    if (!amount || !orderId) {
      return NextResponse.json(
        { error: 'Missing amount or orderId' },
        { status: 400 }
      )
    }

    // Create payment intent
    const paymentIntent = await createPaymentIntent(amount, currency)

    // Store payment intent ID in order
    if (orderId) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ payment_intent_id: paymentIntent.id })
        .eq('id', orderId)

      if (updateError) {
        console.error('Error updating order with payment intent ID:', updateError)
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error: any) {
    console.error('Stripe payment intent error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment intent' },
      { status: 500 }
    )
  }
}
