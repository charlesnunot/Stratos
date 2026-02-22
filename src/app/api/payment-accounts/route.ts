/**
 * Payment accounts management API
 * Allows sellers to manage their payment accounts (Stripe, PayPal, Alipay, WeChat, Bank)
 * 
 * Now integrated with MCRE (Monetization Capability Resolution Engine):
 * - Uses resolveUserCapabilities() for permission checks
 * - Stores capability snapshot at binding time for audit
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserCapabilities } from '@/lib/auth/capabilities'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // MCRE: Resolve user capabilities
    const capability = await resolveUserCapabilities(user.id)
    if (!capability.capabilityState.payoutRoutingEnabled) {
      return NextResponse.json(
        { error: capability.capabilityState.canMonetize 
          ? 'Payout routing not available due to risk or compliance' 
          : 'Monetization capability not available. Please subscribe to Seller, Affiliate, or Tip plan.' 
        },
        { status: 403 }
      )
    }

    // Get all payment accounts for this user
    const { data: accounts, error: accountsError } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('seller_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (accountsError) {
      return NextResponse.json(
        { error: `Failed to fetch accounts: ${accountsError.message}` },
        { status: 500 }
      )
    }

    // Get seller payment account status from profiles table (new model); seller_type for direct-seller UI
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('payment_provider, payment_account_id, provider_charges_enabled, provider_payouts_enabled, provider_account_status, seller_payout_eligibility, seller_type')
      .eq('id', user.id)
      .single()

    // Check if the referenced account in profiles still exists in payment_accounts
    let profileStatus = profile
    if (profile?.payment_account_id) {
      const accountExists = (accounts || []).some(acc => acc.id === profile.payment_account_id)
      if (!accountExists) {
        const { createClient: createAdminClient } = await import('@supabase/supabase-js')
        const supabaseAdmin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
        await supabaseAdmin
          .from('profiles')
          .update({
            payment_provider: null,
            payment_account_id: null,
            provider_charges_enabled: null,
            provider_payouts_enabled: null,
            provider_account_status: null,
            seller_payout_eligibility: null,
          })
          .eq('id', user.id)
        profileStatus = {
          ...profile,
          payment_provider: null,
          payment_account_id: null,
          provider_charges_enabled: null,
          provider_payouts_enabled: null,
          provider_account_status: null,
          seller_payout_eligibility: null,
        }
      }
    }

    // Combine payment_accounts data with profiles status
    const accountsWithStatus = (accounts || []).map((account) => ({
      ...account,
      ...(profileStatus && profileStatus.payment_provider === account.account_type && profileStatus.payment_account_id ? {
        provider_charges_enabled: profileStatus.provider_charges_enabled,
        provider_payouts_enabled: profileStatus.provider_payouts_enabled,
        provider_account_status: profileStatus.provider_account_status,
        seller_payout_eligibility: profileStatus.seller_payout_eligibility,
      } : {}),
    }))

    // Return response with no-cache headers to ensure fresh data
    return NextResponse.json({ 
      accounts: accountsWithStatus,
      profileStatus: profileStatus ? {
        payment_provider: profileStatus.payment_provider,
        payment_account_id: profileStatus.payment_account_id,
        provider_charges_enabled: profileStatus.provider_charges_enabled,
        provider_payouts_enabled: profileStatus.provider_payouts_enabled,
        provider_account_status: profileStatus.provider_account_status,
        seller_payout_eligibility: profileStatus.seller_payout_eligibility,
        seller_type: profileStatus.seller_type ?? 'external',
      } : null,
      // Also return MCRE snapshot for client reference
      mcre: {
        resolutionId: capability.resolutionId,
        resolvedAt: capability.resolvedAt,
        canMonetize: capability.capabilityState.canMonetize,
        payoutRoutingEnabled: capability.capabilityState.payoutRoutingEnabled,
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error: any) {
    console.error('Get payment accounts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get payment accounts' },
      { status: 500 }
    )
  }
}

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

    // MCRE: Resolve user capabilities
    const capability = await resolveUserCapabilities(user.id)
    if (!capability.capabilityState.payoutRoutingEnabled) {
      return NextResponse.json(
        { error: capability.capabilityState.canMonetize 
          ? 'Payout routing not available due to risk or compliance' 
          : 'Monetization capability not available. Please subscribe to Seller, Affiliate, or Tip plan.' 
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      accountType,
      accountName,
      accountInfo,
      currency = 'USD',
      supportedCurrencies = ['USD'],
      isDefault = false,
    } = body

    // Validate required fields
    if (!accountType || !accountInfo) {
      return NextResponse.json(
        { error: 'Missing required fields: accountType and accountInfo' },
        { status: 400 }
      )
    }

    // Validate account type
    const validAccountTypes = ['stripe', 'paypal', 'alipay', 'wechat', 'bank']
    if (!validAccountTypes.includes(accountType)) {
      return NextResponse.json(
        { error: `Invalid account type. Must be one of: ${validAccountTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate currency
    const validCurrencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']
    if (!validCurrencies.includes(currency)) {
      return NextResponse.json(
        { error: `Invalid currency. Must be one of: ${validCurrencies.join(', ')}` },
        { status: 400 }
      )
    }

    // If setting as default, unset other default accounts of the same type
    if (isDefault) {
      await supabase
        .from('payment_accounts')
        .update({ is_default: false })
        .eq('seller_id', user.id)
        .eq('account_type', accountType)
    }

    // Create payment account with MCRE snapshot
    const { data: newAccount, error: createError } = await supabase
      .from('payment_accounts')
      .insert({
        seller_id: user.id,
        account_type: accountType,
        account_name: accountName || `${accountType} account`,
        account_info: accountInfo,
        currency: currency,
        supported_currencies: supportedCurrencies,
        is_default: isDefault,
        is_verified: false,
        verification_status: 'pending',
        // MCRE: Store capability snapshot at binding time
        capability_resolution_id: capability.resolutionId,
        capability_hash_proof: capability.hashProof,
        capability_attestation_signature: capability.attestationSignature,
        capability_resolved_at: capability.resolvedAt,
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json(
        { error: `Failed to create account: ${createError.message}` },
        { status: 500 }
      )
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'payment_account_capability_bound',
      userId: user.id,
      resourceId: newAccount.id,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: {
        resolutionId: capability.resolutionId,
        hashProof: capability.hashProof,
        attestationSignature: capability.attestationSignature,
        boundAt: capability.resolvedAt,
        capabilityState: capability.capabilityState,
      },
    })

    return NextResponse.json({ 
      account: newAccount,
      mcre: {
        resolutionId: capability.resolutionId,
        hashProof: capability.hashProof,
        resolvedAt: capability.resolvedAt,
      }
    }, { status: 201 })
  } catch (error: any) {
    console.error('Create payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment account' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // MCRE: Resolve user capabilities
    const capability = await resolveUserCapabilities(user.id)
    if (!capability.capabilityState.payoutRoutingEnabled) {
      return NextResponse.json(
        { error: capability.capabilityState.canMonetize 
          ? 'Payout routing not available due to risk or compliance' 
          : 'Monetization capability not available. Please subscribe to Seller, Affiliate, or Tip plan.' 
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, accountName, accountInfo, currency, supportedCurrencies, isDefault } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    // Verify account belongs to user
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id')
      .eq('id', id)
      .single()

    if (fetchError || !existingAccount) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    if (existingAccount.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your account' },
        { status: 403 }
      )
    }

    // If setting as default, unset other default accounts of the same type
    if (isDefault) {
      const { data: accountType } = await supabase
        .from('payment_accounts')
        .select('account_type')
        .eq('id', id)
        .single()

      if (accountType) {
        await supabase
          .from('payment_accounts')
          .update({ is_default: false })
          .eq('seller_id', user.id)
          .eq('account_type', accountType.account_type)
          .neq('id', id)
      }
    }

    // Build update object
    const updateData: any = {}
    if (accountName !== undefined) updateData.account_name = accountName
    if (accountInfo !== undefined) updateData.account_info = accountInfo
    if (currency !== undefined) updateData.currency = currency
    if (supportedCurrencies !== undefined) updateData.supported_currencies = supportedCurrencies
    if (isDefault !== undefined) updateData.is_default = isDefault

    // Update account
    const { data: updatedAccount, error: updateError } = await supabase
      .from('payment_accounts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'payment_account_update',
        userId: user.id,
        resourceId: id,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: updateError.message },
      })
      return NextResponse.json(
        { error: `Failed to update account: ${updateError.message}` },
        { status: 500 }
      )
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'payment_account_update',
      userId: user.id,
      resourceId: id,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ account: updatedAccount })
  } catch (error: any) {
    console.error('Update payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update payment account' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // MCRE: Resolve user capabilities
    const capability = await resolveUserCapabilities(user.id)
    if (!capability.capabilityState.payoutRoutingEnabled) {
      return NextResponse.json(
        { error: capability.capabilityState.canMonetize 
          ? 'Payout routing not available due to risk or compliance' 
          : 'Monetization capability not available. Please subscribe to Seller, Affiliate, or Tip plan.' 
        },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    // Verify account belongs to user
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id')
      .eq('id', id)
      .single()

    if (fetchError || !existingAccount) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    if (existingAccount.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your account' },
        { status: 403 }
      )
    }

    // Delete account
    const { error: deleteError } = await supabase
      .from('payment_accounts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      const { logAudit } = await import('@/lib/api/audit')
      logAudit({
        action: 'payment_account_delete',
        userId: user.id,
        resourceId: id,
        resourceType: 'payment_account',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: deleteError.message },
      })
      return NextResponse.json(
        { error: `Failed to delete account: ${deleteError.message}` },
        { status: 500 }
      )
    }

    const { logAudit } = await import('@/lib/api/audit')
    logAudit({
      action: 'payment_account_delete',
      userId: user.id,
      resourceId: id,
      resourceType: 'payment_account',
      result: 'success',
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete payment account' },
      { status: 500 }
    )
  }
}
