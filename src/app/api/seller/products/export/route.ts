/**
 * Seller API: Export products
 * GET: Export products to CSV/JSON
 * Only available for Growth ($50) and Scale ($100) tier sellers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Validate seller tier
async function validateSellerTier(supabase: any, userId: string): Promise<{ valid: boolean; error?: string }> {
  // Check if direct seller
  const { data: profile } = await supabase
    .from('profiles')
    .select('seller_type, role')
    .eq('id', userId)
    .single()

  if (profile?.seller_type === 'direct') {
    return { valid: true }
  }

  // Check subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .eq('subscription_type', 'seller')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()

  if (!subscription) {
    return { valid: false, error: 'No active seller subscription' }
  }

  const tier = subscription.subscription_tier
  
  // Only Growth (50) and Scale (100) can use export
  if (tier < 50) {
    return { valid: false, error: 'Export requires Growth or Scale tier subscription' }
  }

  return { valid: true }
}

// Convert products to CSV
function productsToCSV(products: any[]): string {
  const headers = [
    'id',
    'name',
    'description',
    'price',
    'currency',
    'stock',
    'category',
    'condition',
    'status',
    'images',
    'color_options',
    'sizes',
    'shipping_fee',
    'sales_countries',
    'like_count',
    'want_count',
    'created_at',
  ]

  const rows = products.map(product => [
    product.id,
    `"${(product.name || '').replace(/"/g, '""')}"`,
    `"${(product.description || '').replace(/"/g, '""')}"`,
    product.price,
    product.currency,
    product.stock ?? '',
    product.category || '',
    product.condition || '',
    product.status,
    (product.images || []).join(';'),
    (product.color_options || []).map((c: any) => c.name).join(';'),
    (product.sizes || []).join(';'),
    product.shipping_fee ?? '',
    (product.sales_countries || []).join(';'),
    product.like_count,
    product.want_count,
    product.created_at,
  ])

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
}

// Convert products to JSON
function productsToJSON(products: any[]): string {
  const exportData = products.map(product => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    currency: product.currency,
    stock: product.stock,
    category: product.category,
    condition: product.condition,
    status: product.status,
    images: product.images,
    color_options: product.color_options?.map((c: any) => c.name),
    sizes: product.sizes,
    shipping_fee: product.shipping_fee,
    sales_countries: product.sales_countries,
    stats: {
      like_count: product.like_count,
      want_count: product.want_count,
    },
    created_at: product.created_at,
  }))

  return JSON.stringify({ products: exportData }, null, 2)
}

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

    // Validate seller tier
    const tierCheck = await validateSellerTier(supabase, user.id)
    if (!tierCheck.valid) {
      return NextResponse.json({ error: tierCheck.error }, { status: 403 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv' // csv, json
    const status = searchParams.get('status') // Filter by status

    // Build query
    let query = supabase
      .from('products')
      .select('*')
      .eq('seller_id', user.id)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: products, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[seller/products/export GET] Error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch products', details: error.message },
        { status: 500 }
      )
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products to export' }, { status: 404 })
    }

    // Generate export data
    let content: string
    let contentType: string
    let filename: string

    if (format === 'json') {
      content = productsToJSON(products)
      contentType = 'application/json'
      filename = `products-export-${new Date().toISOString().split('T')[0]}.json`
    } else {
      content = productsToCSV(products)
      contentType = 'text/csv'
      filename = `products-export-${new Date().toISOString().split('T')[0]}.csv`
    }

    // Return as file download
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    console.error('[seller/products/export GET] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
