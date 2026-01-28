/**
 * Stripe Connect callback handler
 * Handles return from Stripe Connect onboarding
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnectAccountStatus } from '@/lib/payments/stripe-connect'
import { updateSellerPayoutEligibility } from '@/lib/payments/update-seller-payout-eligibility'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')

    if (!accountId) {
      return NextResponse.redirect(new URL('/seller/payment-accounts?error=no_account_id', request.url))
    }

    // Use admin client
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

    // Get account status from Stripe
    const accountStatus = await getConnectAccountStatus(accountId)

    // Update profiles table with payment account information (new model)
    // Save provider status (read-only cache)
    const providerAccountStatus = accountStatus.chargesEnabled && accountStatus.payoutsEnabled
      ? 'enabled'
      : accountStatus.detailsSubmitted
      ? 'pending'
      : 'disabled'

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        payment_provider: 'stripe',
        payment_account_id: accountId,
        // Provider status (read-only cache from Stripe)
        provider_charges_enabled: accountStatus.chargesEnabled,
        provider_payouts_enabled: accountStatus.payoutsEnabled,
        provider_account_status: providerAccountStatus,
      })
      .eq('id', user.id)

    if (profileUpdateError) {
      console.error('Error updating profile with payment account:', profileUpdateError)
      return NextResponse.redirect(new URL('/seller/payment-accounts?error=update_failed', request.url))
    }

    // Trigger eligibility recalculation (must use updateSellerPayoutEligibility service)
    const eligibilityResult = await updateSellerPayoutEligibility({
      sellerId: user.id,
      supabaseAdmin,
    })

    if (!eligibilityResult.success) {
      console.error('Error updating seller payout eligibility:', eligibilityResult.error)
      // Don't fail the callback, but log the error
    }

    // Also update payment_accounts table for backward compatibility
    const { data: paymentAccount } = await supabaseAdmin
      .from('payment_accounts')
      .select('id')
      .eq('seller_id', user.id)
      .eq('account_type', 'stripe')
      .maybeSingle()

    if (paymentAccount) {
      await supabaseAdmin
        .from('payment_accounts')
        .update({
          account_info: {
            stripe: {
              account_id: accountId,
              charges_enabled: accountStatus.chargesEnabled,
              payouts_enabled: accountStatus.payoutsEnabled,
              details_submitted: accountStatus.detailsSubmitted,
            },
          },
          // If account is fully set up, mark as verified
          is_verified: accountStatus.chargesEnabled && accountStatus.payoutsEnabled && accountStatus.detailsSubmitted,
          verification_status: accountStatus.chargesEnabled && accountStatus.payoutsEnabled && accountStatus.detailsSubmitted
            ? 'verified'
            : 'pending',
        })
        .eq('id', paymentAccount.id)
    }

    // Redirect to payment accounts page
    if (accountStatus.chargesEnabled && accountStatus.payoutsEnabled) {
      return NextResponse.redirect(new URL('/seller/payment-accounts?success=stripe_connected', request.url))
    } else {
      return NextResponse.redirect(new URL('/seller/payment-accounts?warning=stripe_pending', request.url))
    }
  } catch (error: any) {
    console.error('Stripe Connect callback error:', error)
    return NextResponse.redirect(new URL('/seller/payment-accounts?error=callback_failed', request.url))
  }
}
