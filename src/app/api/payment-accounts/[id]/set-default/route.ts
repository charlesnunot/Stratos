/**
 * Set default payment account API
 * Sets a payment account as the default for its type
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
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

    // Verify account belongs to user and get account type
    const { data: account, error: fetchError } = await supabase
      .from('payment_accounts')
      .select('seller_id, account_type')
      .eq('id', params.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      )
    }

    if (account.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: Not your account' },
        { status: 403 }
      )
    }

    // Unset other default accounts of the same type
    await supabase
      .from('payment_accounts')
      .update({ is_default: false })
      .eq('seller_id', user.id)
      .eq('account_type', account.account_type)
      .neq('id', params.id)

    // Set this account as default
    const { data: updatedAccount, error: updateError } = await supabase
      .from('payment_accounts')
      .update({ is_default: true })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to set default account: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ account: updatedAccount })
  } catch (error: any) {
    console.error('Set default payment account error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to set default payment account' },
      { status: 500 }
    )
  }
}
