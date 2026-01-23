/**
 * Single platform payment account API
 * GET, PUT, DELETE operations for a specific platform payment account
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: account, error: accountError } = await supabase
      .from('payment_accounts')
      .select('*')
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
  } catch (error: any) {
    console.error('Get platform payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get platform payment account' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
    const updateData: any = {}
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
  } catch (error: any) {
    console.error('Update platform payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update platform payment account' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify account is a platform account
    const { data: existingAccount, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('is_platform_account')
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

    // Delete account
    const { error: deleteError } = await supabase
      .from('payment_accounts')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete account: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete platform payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete platform payment account' },
      { status: 500 }
    )
  }
}
