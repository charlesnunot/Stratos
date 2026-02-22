import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    const supabaseAdmin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: accounts, error } = await supabaseAdmin
      .from('payment_accounts')
      .select('id, account_type, account_name, is_default, status')
      .eq('seller_id', userId)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch payment accounts: ${error.message}` },
        { status: 500 }
      )
    }

    const paymentMethods = (accounts || []).map(account => {
      const methodMap: Record<string, 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'> = {
        stripe: 'stripe',
        paypal: 'paypal',
        alipay: 'alipay',
        wechat: 'wechat',
        bank: 'bank'
      }
      return {
        id: account.id,
        type: methodMap[account.account_type] || account.account_type,
        name: account.account_name || account.account_type,
        isDefault: account.is_default
      }
    })

    return NextResponse.json({
      paymentAccounts: paymentMethods
    })
  } catch (error) {
    console.error('Payment accounts API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payment accounts' },
      { status: 500 }
    )
  }
}
