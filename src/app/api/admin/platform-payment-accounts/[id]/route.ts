/**
 * Single platform payment account API
 * GET, PUT, PATCH operations for a specific platform payment account
 * Note: DELETE is replaced with PATCH for soft disable (status management)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { supabase } = authResult.data

    const { data: account, error: accountError } = await supabase
      .from('payment_accounts')
      .select('*, disabled_at, disabled_by, enabled_at, enabled_by, status')
      .eq('id', params.id)
      .eq('is_platform_account', true)
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Platform account not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ account })
  } catch (error: unknown) {
    const { handleApiError } = await import('@/lib/api/error-handler')
    const { generateRequestId } = await import('@/lib/api/logger')
    return handleApiError(error, {
      path: `/api/admin/platform-payment-accounts/${params.id}`,
      method: 'GET',
      requestId: generateRequestId(),
    })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { supabase } = authResult.data

    const body = await request.json()
    const { accountName, accountInfo, currency, supportedCurrencies } = body

    // Verify account is a platform account
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('is_platform_account, account_type')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingAccount) {
      return NextResponse.json(
        { error: 'Platform account not found' },
        { status: 404 }
      )
    }

    if (!existingAccount.is_platform_account) {
      return NextResponse.json(
        { error: 'This is not a platform account' },
        { status: 400 }
      )
    }

    // Build update object
    const updateData: {
      account_name?: string
      account_info?: Record<string, unknown>
      currency?: string
      supported_currencies?: string[]
    } = {}
    if (accountName !== undefined) updateData.account_name = accountName
    if (accountInfo !== undefined) updateData.account_info = accountInfo
    if (currency !== undefined) updateData.currency = currency
    if (supportedCurrencies !== undefined) updateData.supported_currencies = supportedCurrencies

    // Update account
    const { data: updatedAccount, error: updateError } = await supabase
      .from('payment_accounts')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update account: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ account: updatedAccount })
  } catch (error: unknown) {
    const { handleApiError } = await import('@/lib/api/error-handler')
    const { generateRequestId } = await import('@/lib/api/logger')
    return handleApiError(error, {
      path: `/api/admin/platform-payment-accounts/${params.id}`,
      method: 'PUT',
      requestId: generateRequestId(),
    })
  }
}

/**
 * PATCH: Update account status (enable/disable)
 * Replaces DELETE operation with soft disable mechanism
 * This prevents accidental deletion and preserves audit trail
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user, supabase } = authResult.data

    const body = await request.json()
    const { status } = body

    // Validate status value
    if (!status || !['active', 'disabled'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "active" or "disabled"' },
        { status: 400 }
      )
    }

    // Verify account is a platform account
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('is_platform_account, account_type, status')
      .eq('id', params.id)
      .single()

    if (fetchError || !existingAccount) {
      return NextResponse.json(
        { error: 'Platform account not found' },
        { status: 404 }
      )
    }

    if (!existingAccount.is_platform_account) {
      return NextResponse.json(
        { error: 'This is not a platform account' },
        { status: 400 }
      )
    }

    // If enabling account, check uniqueness constraint
    if (status === 'active') {
      // Check if another active account of the same type exists
      const { data: otherActive, error: checkError } = await supabase
        .from('payment_accounts')
        .select('id')
        .eq('is_platform_account', true)
        .eq('account_type', existingAccount.account_type)
        .eq('status', 'active')
        .neq('id', params.id)
        .maybeSingle()

      if (checkError) {
        return NextResponse.json(
          { error: `Failed to check uniqueness: ${checkError.message}` },
          { status: 500 }
        )
      }

      if (otherActive) {
        return NextResponse.json(
          {
            error: `Another active ${existingAccount.account_type} account already exists. Please disable it first.`,
          },
          { status: 400 }
        )
      }
    }

    // Build update data
    const updateData: {
      status: 'active' | 'disabled'
      updated_at: string
      disabled_at?: string | null
      disabled_by?: string | null
      enabled_at?: string | null
      enabled_by?: string | null
    } = {
      status,
      updated_at: new Date().toISOString(),
    }

    // Set audit fields based on status
    if (status === 'disabled') {
      updateData.disabled_at = new Date().toISOString()
      updateData.disabled_by = user.id
      // Clear enabled fields when disabling
      updateData.enabled_at = null
      updateData.enabled_by = null
    } else if (status === 'active') {
      updateData.enabled_at = new Date().toISOString()
      updateData.enabled_by = user.id
      // Keep disabled_at and disabled_by for audit trail
    }

    // Update account status
    const { data: updatedAccount, error: updateError } = await supabase
      .from('payment_accounts')
      .update(updateData)
      .eq('id', params.id)
      .select('*, disabled_at, disabled_by, enabled_at, enabled_by, status')
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update account status: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      account: updatedAccount,
      message: `Account ${status === 'active' ? 'enabled' : 'disabled'} successfully`,
    })
  } catch (error: unknown) {
    const { handleApiError } = await import('@/lib/api/error-handler')
    const { generateRequestId } = await import('@/lib/api/logger')
    return handleApiError(error, {
      path: `/api/admin/platform-payment-accounts/${params.id}`,
      method: 'PATCH',
      requestId: generateRequestId(),
    })
  }
}
