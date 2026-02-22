import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export interface PaymentDestination {
  isInternal: boolean
  destinationAccountId?: string
  paymentProvider?: string
  sellerType?: string
}

export interface GetPaymentDestinationParams {
  recipientId: string
  context: 'tip' | 'order' | 'subscription' | 'commission'
}

/**
 * Unified payment destination determination service
 * 
 * Determines whether payment should go to platform or directly to user
 * based on user type and payment configuration.
 * 
 * @param params.recipientId - The user ID who will receive the payment
 * @param params.context - Payment context (tip/order/subscription/commission)
 * 
 * @returns PaymentDestination with:
 *   - isInternal: true if payment goes to platform
 *   - destinationAccountId: Stripe Connect account ID (for external users)
 *   - paymentProvider: payment provider (stripe/paypal/etc)
 *   - sellerType: seller type snapshot (direct/external)
 */
export async function getPaymentDestination(
  params: GetPaymentDestinationParams
): Promise<PaymentDestination> {
  const { recipientId, context } = params

  const supabaseAdmin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('user_origin, seller_type, payment_account_id, payment_provider')
    .eq('id', recipientId)
    .single()

  if (error || !profile) {
    console.error('[getPaymentDestination] Failed to fetch profile:', error)
    throw new Error(`Failed to fetch profile for recipient: ${recipientId}`)
  }

  const isInternal = profile.user_origin === 'internal'
  const isDirect = profile.seller_type === 'direct'

  if (isInternal || isDirect) {
    return {
      isInternal: true,
      sellerType: profile.seller_type || undefined,
    }
  }

  if (profile.payment_account_id && profile.payment_provider) {
    return {
      isInternal: false,
      destinationAccountId: profile.payment_account_id,
      paymentProvider: profile.payment_provider,
      sellerType: profile.seller_type || undefined,
    }
  }

  // At this point, user is external without payment account
  throw new Error(`External user ${recipientId} has no payment account bound. Cannot receive ${context} payments.`)
}
