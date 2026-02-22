/**
 * Seller API: Bulk import products
 * POST: Import products from CSV/Excel/JSON
 * Only available for Growth ($50) and Scale ($100) tier sellers
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { randomUUID } from 'crypto'

interface ProductImportRow {
  name: string
  description?: string
  price: number
  currency?: string
  stock?: number
  category?: string
  condition?: 'new' | 'like_new' | 'ninety_five' | 'ninety' | 'eighty' | 'seventy_or_below'
  images?: string[]
  color_options?: string[]
  sizes?: string[]
  shipping_fee?: number
  sales_countries?: string[]
}

// Validate seller tier
async function validateSellerTier(supabase: any, userId: string): Promise<{ valid: boolean; tier?: number; limit?: number; error?: string }> {
  // Check if direct seller
  const { data: profile } = await supabase
    .from('profiles')
    .select('seller_type, role')
    .eq('id', userId)
    .single()

  if (profile?.seller_type === 'direct') {
    return { valid: true, tier: 100, limit: 999999 }
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
  
  // Only Growth (50) and Scale (100) can use bulk import
  if (tier < 50) {
    return { valid: false, error: 'Bulk import requires Growth or Scale tier subscription' }
  }

  const limit = tier === 100 ? 500 : 200
  return { valid: true, tier, limit }
}

// Parse CSV
function parseCSV(csvText: string): ProductImportRow[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: ProductImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: any = {}

    headers.forEach((header, index) => {
      const value = values[index]
      if (!value) return

      switch (header) {
        case 'name':
          row.name = value
          break
        case 'description':
          row.description = value
          break
        case 'price':
          row.price = parseFloat(value)
          break
        case 'currency':
          row.currency = value
          break
        case 'stock':
          row.stock = parseInt(value)
          break
        case 'category':
          row.category = value
          break
        case 'condition':
          row.condition = value as any
          break
        case 'images':
          row.images = value.split(';').filter(Boolean)
          break
        case 'color_options':
          row.color_options = value.split(';').filter(Boolean)
          break
        case 'sizes':
          row.sizes = value.split(';').filter(Boolean)
          break
        case 'shipping_fee':
          row.shipping_fee = parseFloat(value)
          break
        case 'sales_countries':
          row.sales_countries = value.split(';').filter(Boolean)
          break
      }
    })

    if (row.name && row.price) {
      rows.push(row as ProductImportRow)
    }
  }

  return rows
}

// Parse JSON
function parseJSON(jsonText: string): ProductImportRow[] {
  try {
    const data = JSON.parse(jsonText)
    if (Array.isArray(data)) {
      return data.filter(row => row.name && row.price)
    }
    if (data.products && Array.isArray(data.products)) {
      return data.products.filter((row: any) => row.name && row.price)
    }
    return []
  } catch {
    return []
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

    // Validate seller tier
    const tierCheck = await validateSellerTier(supabase, user.id)
    if (!tierCheck.valid) {
      return NextResponse.json({ error: tierCheck.error }, { status: 403 })
    }

    // Check payment account status
    const { data: profile } = await supabase
      .from('profiles')
      .select('seller_type, payment_provider, payment_account_id')
      .eq('id', user.id)
      .single()

    if (profile?.seller_type !== 'direct' && !(profile?.payment_provider && profile?.payment_account_id)) {
      return NextResponse.json({ error: 'Payment account not bound. Please bind a payment account before creating products.' }, { status: 403 })
    }

    // Parse request body
    const formData = await request.formData()
    const file = formData.get('file') as File
    const format = formData.get('format') as string || 'csv' // csv, json
    const dryRun = formData.get('dryRun') === 'true'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read file content
    const fileContent = await file.text()
    let products: ProductImportRow[] = []

    if (format === 'csv') {
      products = parseCSV(fileContent)
    } else if (format === 'json') {
      products = parseJSON(fileContent)
    } else {
      return NextResponse.json({ error: 'Unsupported format. Use csv or json' }, { status: 400 })
    }

    if (products.length === 0) {
      return NextResponse.json({ error: 'No valid products found in file' }, { status: 400 })
    }

    // Check product limit
    const { count: currentCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', user.id)
      .in('status', ['active', 'pending', 'inactive'])

    const remainingSlots = (tierCheck.limit || 0) - (currentCount || 0)

    if (products.length > remainingSlots) {
      return NextResponse.json({
        error: `Product limit exceeded. You can import ${remainingSlots} more products.`,
        currentCount,
        limit: tierCheck.limit,
        attempted: products.length,
      }, { status: 400 })
    }

    // Validate products
    const validationErrors: Array<{ row: number; errors: string[] }> = []
    const validProducts: ProductImportRow[] = []

    products.forEach((product, index) => {
      const errors: string[] = []

      if (!product.name || product.name.length < 2) {
        errors.push('Name must be at least 2 characters')
      }
      if (product.name && product.name.length > 200) {
        errors.push('Name must be at most 200 characters')
      }
      if (product.price <= 0) {
        errors.push('Price must be greater than 0')
      }
      if (product.price > 999999) {
        errors.push('Price must be at most 999,999')
      }
      if (product.stock !== undefined && product.stock < 0) {
        errors.push('Stock cannot be negative')
      }

      if (errors.length > 0) {
        validationErrors.push({ row: index + 1, errors })
      } else {
        validProducts.push(product)
      }
    })

    // If dry run, return validation results only
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalRows: products.length,
        validRows: validProducts.length,
        invalidRows: validationErrors.length,
        validationErrors,
        canImport: validationErrors.length === 0 && validProducts.length > 0,
        remainingSlots,
      })
    }

    // If there are validation errors, don't proceed
    if (validationErrors.length > 0) {
      return NextResponse.json({
        error: 'Validation failed',
        totalRows: products.length,
        validRows: validProducts.length,
        invalidRows: validationErrors.length,
        validationErrors,
      }, { status: 400 })
    }

    // Import products
    const admin = await getSupabaseAdmin()
    const importedProducts: any[] = []
    const importErrors: Array<{ row: number; error: string }> = []

    for (let i = 0; i < validProducts.length; i++) {
      const product = validProducts[i]

      try {
        const { data: insertedProduct, error: insertError } = await admin
          .from('products')
          .insert({
            id: randomUUID(),
            seller_id: user.id,
            name: product.name,
            description: product.description || null,
            price: product.price,
            currency: product.currency || 'USD',
            stock: product.stock ?? null,
            category: product.category || null,
            condition: product.condition || null,
            images: product.images || [],
            color_options: product.color_options?.map((name, idx) => ({
              name,
              image_url: null,
              image_from_index: null,
            })) || null,
            sizes: product.sizes || null,
            shipping_fee: product.shipping_fee || null,
            sales_countries: product.sales_countries || null,
            status: 'pending', // Requires admin approval
            content_lang: 'zh', // Default to Chinese
          })
          .select()
          .single()

        if (insertError) {
          importErrors.push({ row: i + 1, error: insertError.message })
        } else {
          importedProducts.push(insertedProduct)
        }
      } catch (error: any) {
        importErrors.push({ row: i + 1, error: error.message })
      }
    }

    // Log audit
    logAudit({
      action: 'bulk_import_products',
      userId: user.id,
      resourceId: undefined,
      resourceType: 'products',
      result: importErrors.length === 0 ? 'success' : 'partial',
      timestamp: new Date().toISOString(),
      meta: {
        attempted: validProducts.length,
        imported: importedProducts.length,
        failed: importErrors.length,
      },
    })

    return NextResponse.json({
      success: importErrors.length === 0,
      totalAttempted: validProducts.length,
      imported: importedProducts.length,
      failed: importErrors.length,
      products: importedProducts,
      errors: importErrors,
    })
  } catch (error: unknown) {
    console.error('[seller/products/bulk-import POST] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
