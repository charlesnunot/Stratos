import { NextRequest, NextResponse } from 'next/server'
import { getPaymentDestination } from '@/lib/payments/get-payment-destination'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recipientId = searchParams.get('recipientId')
    const context = searchParams.get('context') as 'tip' | 'order' | 'subscription' | 'commission' | null

    if (!recipientId) {
      return NextResponse.json(
        { error: 'Missing recipientId parameter' },
        { status: 400 }
      )
    }

    if (!context || !['tip', 'order', 'subscription', 'commission'].includes(context)) {
      return NextResponse.json(
        { error: 'Invalid or missing context parameter' },
        { status: 400 }
      )
    }

    const destination = await getPaymentDestination({
      recipientId,
      context,
    })

    return NextResponse.json(destination)
  } catch (error: any) {
    console.error('[payments/destination] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get payment destination' },
      { status: 500 }
    )
  }
}
