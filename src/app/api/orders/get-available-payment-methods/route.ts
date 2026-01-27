/**
 * Get available payment methods for sellers
 * Returns the intersection of payment methods that all sellers support
 * Used by frontend to filter payment method options
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const { productIds, sellerIds } = body

    // Get Supabase admin client
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

    let targetSellerIds: string[] = []

    // If productIds provided, get seller IDs from products
    if (productIds && Array.isArray(productIds) && productIds.length > 0) {
      const { data: products, error: productsError } = await supabaseAdmin
        .from('products')
        .select('seller_id')
        .in('id', productIds)

      if (productsError) {
        return NextResponse.json(
          { error: `Failed to fetch products: ${productsError.message}` },
          { status: 500 }
        )
      }

      targetSellerIds = [...new Set(products.map(p => p.seller_id))]
    } else if (sellerIds && Array.isArray(sellerIds) && sellerIds.length > 0) {
      targetSellerIds = sellerIds
    } else {
      return NextResponse.json(
        { error: 'Missing required fields: productIds or sellerIds' },
        { status: 400 }
      )
    }

    if (targetSellerIds.length === 0) {
      return NextResponse.json(
        { error: 'No sellers found' },
        { status: 400 }
      )
    }

    // Get payment methods for each seller
    const { data: sellerProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, payment_provider, seller_payout_eligibility')
      .in('id', targetSellerIds)

    if (profilesError) {
      return NextResponse.json(
        { error: `Failed to fetch seller profiles: ${profilesError.message}` },
        { status: 500 }
      )
    }

    // Filter eligible sellers with bound payment accounts
    const eligibleSellers = (sellerProfiles || []).filter(
      (profile) =>
        profile.seller_payout_eligibility === 'eligible' &&
        profile.payment_provider &&
        profile.payment_provider !== null
    )

    if (eligibleSellers.length === 0) {
      return NextResponse.json({
        availableMethods: [],
        sellerMethods: targetSellerIds.map((sellerId) => {
          const profile = sellerProfiles?.find(p => p.id === sellerId)
          return {
            sellerId,
            sellerName: null,
            availableMethods: [],
            eligibility: profile?.seller_payout_eligibility || null,
            reason: profile?.seller_payout_eligibility !== 'eligible' 
              ? 'Seller not eligible' 
              : !profile?.payment_provider 
              ? 'Payment account not bound'
              : 'Unknown',
          }
        }),
      })
    }

    // Get seller names for response
    const { data: sellerDetails } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, username')
      .in('id', targetSellerIds)

    const sellerDetailsMap = new Map(
      (sellerDetails || []).map(s => [s.id, s])
    )

    // Build seller methods info
    const sellerMethods = targetSellerIds.map((sellerId) => {
      const profile = sellerProfiles?.find(p => p.id === sellerId)
      const details = sellerDetailsMap.get(sellerId)
      const availableMethods: string[] = []

      if (profile?.seller_payout_eligibility === 'eligible' && profile.payment_provider) {
        availableMethods.push(profile.payment_provider)
      }

      return {
        sellerId,
        sellerName: details?.display_name || details?.username || sellerId,
        availableMethods,
        eligibility: profile?.seller_payout_eligibility || null,
        reason: profile?.seller_payout_eligibility !== 'eligible'
          ? 'Seller not eligible'
          : !profile?.payment_provider
          ? 'Payment account not bound'
          : null,
      }
    })

    // Calculate intersection: payment methods that ALL sellers support
    const allPaymentMethods = eligibleSellers.map(p => p.payment_provider).filter(Boolean) as string[]
    
    // Count occurrences of each payment method
    const methodCounts = new Map<string, number>()
    allPaymentMethods.forEach(method => {
      methodCounts.set(method, (methodCounts.get(method) || 0) + 1)
    })

    // Only include methods that all eligible sellers support
    const availableMethods = Array.from(methodCounts.entries())
      .filter(([_, count]) => count === eligibleSellers.length)
      .map(([method, _]) => method)
      .filter((method): method is 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank' => 
        ['stripe', 'paypal', 'alipay', 'wechat', 'bank'].includes(method)
      )

    return NextResponse.json({
      availableMethods,
      sellerMethods,
    })
  } catch (error: any) {
    console.error('Get available payment methods error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get available payment methods' },
      { status: 500 }
    )
  }
}
