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
      .select('id, payment_provider, seller_payout_eligibility, seller_type')
      .in('id', targetSellerIds)

    if (profilesError) {
      return NextResponse.json(
        { error: `Failed to fetch seller profiles: ${profilesError.message}` },
        { status: 500 }
      )
    }

    // Check payment methods availability for each seller
    // For direct sellers, we check platform accounts; for external sellers, we check their bound accounts
    const eligibleSellers = []
    const sellerPaymentCapabilities = new Map()

    // First, get all platform payment accounts to avoid repeated RPC calls
    // Get all active platform accounts at once instead of individual RPC calls
    const { data: allPlatformAccounts, error: platformError } = await supabaseAdmin
      .from('payment_accounts')
      .select('account_type')
      .eq('is_platform_account', true)
      .eq('status', 'active')
      .eq('is_verified', true)
    
    const availablePlatformMethods = new Set(allPlatformAccounts?.map(acc => acc.account_type) || [])
    const platformAccountsMap = new Map()
    const paymentMethodsToCheck = ['stripe', 'paypal', 'alipay', 'wechat', 'bank']
    
    for (const method of paymentMethodsToCheck) {
      platformAccountsMap.set(method, availablePlatformMethods.has(method))
    }

    for (const profile of (sellerProfiles || [])) {
      const isDirect = profile.seller_type === 'direct'
      
      if (isDirect) {
        // For direct sellers, check which platform accounts are available
        const directSellerMethods = []
        for (const method of paymentMethodsToCheck) {
          if (platformAccountsMap.get(method)) {
            directSellerMethods.push(method)
          }
        }
        
        if (directSellerMethods.length > 0) {
          eligibleSellers.push(profile)
          sellerPaymentCapabilities.set(profile.id, directSellerMethods)
        }
      } else {
        // For external sellers, check if they have eligible payment accounts
        if (profile.seller_payout_eligibility === 'eligible' && profile.payment_provider) {
          eligibleSellers.push(profile)
          sellerPaymentCapabilities.set(profile.id, [profile.payment_provider])
        }
      }
    }

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

      if (profile) {
        const isDirect = profile.seller_type === 'direct'
        
        if (isDirect) {
          // For direct sellers, get methods from our check above
          const methods = sellerPaymentCapabilities.get(sellerId) || []
          availableMethods.push(...methods)
        } else {
          // For external sellers, check if they have eligible payment accounts
          if (profile.seller_payout_eligibility === 'eligible' && profile.payment_provider) {
            availableMethods.push(profile.payment_provider)
          }
        }
      }

      return {
        sellerId,
        sellerName: details?.display_name || details?.username || sellerId,
        availableMethods,
        eligibility: profile?.seller_payout_eligibility || null,
        reason: profile?.seller_payout_eligibility !== 'eligible'
          ? 'Seller not eligible'
          : !profile?.payment_provider && profile?.seller_type !== 'direct'
          ? 'Payment account not bound'
          : null,
      }
    })

    // Calculate intersection: payment methods that ALL sellers support
    // For each seller, get their available methods
    const sellerMethodArrays = targetSellerIds.map(sellerId => {
      const profile = sellerProfiles?.find(p => p.id === sellerId)
      if (profile) {
        const isDirect = profile.seller_type === 'direct'
        if (isDirect) {
          return sellerPaymentCapabilities.get(sellerId) || []
        } else {
          return profile.seller_payout_eligibility === 'eligible' && profile.payment_provider 
            ? [profile.payment_provider] 
            : []
        }
      }
      return []
    }).filter(arr => arr.length > 0) // Only include sellers that have methods
    
    if (sellerMethodArrays.length === 0) {
      return NextResponse.json({
        availableMethods: [],
        sellerMethods,
      })
    }
    
    // Find intersection of methods across all sellers
    // Start with the methods of the first seller
    let commonMethods = [...sellerMethodArrays[0]]
    
    // Intersect with each subsequent seller's methods
    for (let i = 1; i < sellerMethodArrays.length; i++) {
      commonMethods = commonMethods.filter(method => 
        sellerMethodArrays[i].includes(method)
      )
    }
    
    const availableMethods = commonMethods.filter((method): method is 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank' => 
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
