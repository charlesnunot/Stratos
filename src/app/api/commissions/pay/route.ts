/**
 * Commission payment API
 * Allows sellers to pay commissions to affiliates
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/api/audit'
import { recordCommissionLedger } from '@/lib/payments/ledger-helpers'

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

    // Get pending commission obligations for this seller
    const { data: obligations, error: obligationsError } = await supabase
      .from('commission_payment_obligations')
      .select('*')
      .eq('seller_id', user.id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })

    if (obligationsError) {
      return NextResponse.json(
        { error: `Failed to fetch obligations: ${obligationsError.message}` },
        { status: 500 }
      )
    }

    // Get unpaid commissions for this seller
    const { data: unpaidCommissions, error: commissionsError } = await supabase
      .from('affiliate_commissions')
      .select(`
        *,
        orders!inner(seller_id),
        profiles!affiliate_commissions_affiliate_id_fkey(id, username, display_name)
      `)
      .eq('orders.seller_id', user.id)
      .eq('status', 'pending')

    if (commissionsError) {
      return NextResponse.json(
        { error: `Failed to fetch commissions: ${commissionsError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      obligations: obligations || [],
      unpaidCommissions: unpaidCommissions || [],
    })
  } catch (error: any) {
    console.error('Get commissions error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get commissions' },
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

    const body = await request.json()
    const { obligationId, paymentTransactionId, paymentMethod: bodyPaymentMethod } = body
    const paymentMethod = bodyPaymentMethod ?? 'stripe'

    if (!obligationId) {
      return NextResponse.json(
        { error: 'Missing obligationId' },
        { status: 400 }
      )
    }

    // Get obligation
    const { data: obligation, error: obligationError } = await supabase
      .from('commission_payment_obligations')
      .select('*')
      .eq('id', obligationId)
      .eq('seller_id', user.id)
      .single()

    if (obligationError || !obligation) {
      return NextResponse.json(
        { error: 'Obligation not found' },
        { status: 404 }
      )
    }

    if (obligation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Obligation already processed' },
        { status: 400 }
      )
    }

    // Use admin client for updates
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

    // Check if obligation is already processed (idempotency)
    const { data: existingObligation } = await supabaseAdmin
      .from('commission_payment_obligations')
      .select('status')
      .eq('id', obligationId)
      .single()

    if (existingObligation?.status !== 'pending') {
      return NextResponse.json(
        { error: 'Obligation already processed' },
        { status: 400 }
      )
    }

    // Update obligation status with condition check (atomic update)
    const { error: updateError } = await supabaseAdmin
      .from('commission_payment_obligations')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_transaction_id: paymentTransactionId || null,
      })
      .eq('id', obligationId)
      .eq('status', 'pending')

    if (updateError?.code === 'PGRST116' || updateError?.code === 'PGRST204') {
      return NextResponse.json(
        { error: 'Obligation already processed' },
        { status: 400 }
      )
    }

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update obligation: ${updateError.message}` },
        { status: 500 }
      )
    }

    // Get all unpaid commissions for this obligation
    const { data: commissions, error: commissionsError } = await supabaseAdmin
      .from('affiliate_commissions')
      .select(`
        id,
        order_id,
        affiliate_id,
        amount,
        currency,
        orders!inner(seller_id, currency)
      `)
      .in('order_id', (
        await supabaseAdmin
          .from('orders')
          .select('id')
          .eq('seller_id', user.id)
      ).data?.map((o: any) => o.id) || [])
      .eq('status', 'pending')

    if (commissions && commissions.length > 0) {
      // Determine if this is a direct seller (platform pays affiliate)
      const { data: sellerProfile } = await supabaseAdmin
        .from('profiles')
        .select('seller_type')
        .eq('id', user.id)
        .single()
      
      const isDirectSeller = sellerProfile?.seller_type === 'direct'

      // Group commissions by affiliate and transfer money
      const commissionsByAffiliate = new Map<string, { amount: number; currency: string; affiliateId: string }>()
      
      for (const commission of commissions) {
        const affiliateId = commission.affiliate_id
        const orders = Array.isArray(commission.orders) ? commission.orders : [commission.orders]
        const currency = commission.currency || orders[0]?.currency || 'USD'
        const existing = commissionsByAffiliate.get(affiliateId)
        
        if (existing) {
          existing.amount += commission.amount
        } else {
          commissionsByAffiliate.set(affiliateId, {
            amount: commission.amount,
            currency,
            affiliateId,
          })
        }
      }

      // Transfer money to each affiliate (paymentMethod from body parsed above)
      // Direct seller: platform pays affiliate (fundsSource: 'platform'); external: seller pays (default)
      const failedAffiliates: string[] = []
      
      for (const [affiliateId, commissionData] of commissionsByAffiliate) {
        try {
          const { transferToSeller } = await import('@/lib/payments/transfer-to-seller')
          const transferResult = await transferToSeller({
            sellerId: affiliateId,
            amount: commissionData.amount,
            currency: commissionData.currency,
            paymentTransactionId: paymentTransactionId || undefined,
            paymentMethod: paymentMethod as any,
            fundsSource: isDirectSeller ? 'platform' : undefined,
            supabaseAdmin,
          })

          if (!transferResult.success) {
            console.error(`Failed to transfer commission to affiliate ${affiliateId}:`, transferResult.error)
            failedAffiliates.push(affiliateId)
          }
        } catch (error) {
          console.error(`Error transferring commission to affiliate ${affiliateId}:`, error)
          failedAffiliates.push(affiliateId)
        }
      }

      // If any transfers failed, return error response
      if (failedAffiliates.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Failed to transfer to affiliates: ${failedAffiliates.join(', ')}`,
          failedAffiliates,
        }, { status: 500 })
      }

      // Update commission records to 'paid'
      const commissionIds = commissions.map((c: any) => c.id)
      await supabaseAdmin
        .from('affiliate_commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .in('id', commissionIds)

      // Record commission ledger entries
      try {
        for (const commission of commissions) {
          await recordCommissionLedger(supabaseAdmin, {
            commissionId: commission.id,
            orderId: commission.order_id,
            affiliateId: commission.affiliate_id,
            sellerId: obligation.seller_id,
            amount: commission.amount,
            currency: commission.currency,
          })
        }
      } catch (ledgerError: any) {
        console.error('[commissions/pay] Failed to record ledger:', ledgerError.message)
      }
    }

    logAudit({
      action: 'commission_pay',
      userId: user.id,
      resourceId: obligationId,
      resourceType: 'commission_obligation',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { obligationId },
    })

    return NextResponse.json({
      success: true,
      message: 'Commission payment recorded successfully',
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Pay commission error:', error)
    }
    const message = error instanceof Error ? error.message : 'Failed to pay commission'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
