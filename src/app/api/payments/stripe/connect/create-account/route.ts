/**
 * Stripe Connect account creation API
 * Creates a Stripe Connect account and returns account link for onboarding
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createConnectAccount, getConnectAccountLink } from '@/lib/payments/stripe-connect'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user email
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { returnUrl, refreshUrl } = body

    if (!returnUrl || !refreshUrl) {
      return NextResponse.json(
        { error: 'Missing returnUrl or refreshUrl' },
        { status: 400 }
      )
    }

    // Create Stripe Connect account
    const accountResult = await createConnectAccount({
      email: user.email || '',
      type: 'express',
    })

    if (!accountResult.accountId) {
      return NextResponse.json(
        { error: accountResult.error || 'Failed to create Stripe Connect account' },
        { status: 500 }
      )
    }

    // Get account link for onboarding
    const linkResult = await getConnectAccountLink({
      accountId: accountResult.accountId,
      returnUrl,
      refreshUrl,
    })

    if (!linkResult.url) {
      return NextResponse.json(
        { error: linkResult.error || 'Failed to create account link' },
        { status: 500 }
      )
    }

    // Save account ID to profiles table (new model) and payment_accounts (backward compatibility)
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

    // Update profiles table with payment account information (new model)
    // Account status will be updated after onboarding completion in callback
    await supabaseAdmin
      .from('profiles')
      .update({
        payment_provider: 'stripe',
        payment_account_id: accountResult.accountId,
        // Initial status - will be updated after onboarding
        provider_charges_enabled: false,
        provider_payouts_enabled: false,
        provider_account_status: 'pending',
      })
      .eq('id', user.id)

    // Also update payment_accounts table for backward compatibility
    const { data: existingAccount } = await supabaseAdmin
      .from('payment_accounts')
      .select('id')
      .eq('seller_id', user.id)
      .eq('account_type', 'stripe')
      .maybeSingle()

    if (existingAccount) {
      // Update existing account
      await supabaseAdmin
        .from('payment_accounts')
        .update({
          account_info: {
            stripe: {
              account_id: accountResult.accountId,
            },
          },
        })
        .eq('id', existingAccount.id)
    } else {
      // Create new account
      await supabaseAdmin
        .from('payment_accounts')
        .insert({
          seller_id: user.id,
          account_type: 'stripe',
          account_name: 'Stripe Connect',
          account_info: {
            stripe: {
              account_id: accountResult.accountId,
            },
          },
          currency: 'USD',
          supported_currencies: ['USD'],
          is_verified: false,
          verification_status: 'pending',
        })
    }

    return NextResponse.json({
      accountId: accountResult.accountId,
      accountLinkUrl: linkResult.url,
    })
  } catch (error: any) {
    console.error('Stripe Connect create account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create Stripe Connect account' },
      { status: 500 }
    )
  }
}
