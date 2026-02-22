import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId } = body

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json(
        { ok: false, reason: 'invalid_request', message: 'Product ID is required' },
        { status: 400 }
      )
    }

    // Create supabase client with user authentication
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, reason: 'unauthorized', message: 'Please login first' },
        { status: 401 }
      )
    }

    // Fetch product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, status, stock, price, images, currency')
      .eq('id', productId)
      .single()

    if (productError) {
      console.error('[validate-product] Error fetching product:', {
        productId,
        error: productError.message,
      })
      return NextResponse.json(
        { ok: false, reason: 'not_found', message: 'Product not found' },
        { status: 404 }
      )
    }

    if (!product) {
      return NextResponse.json(
        { ok: false, reason: 'not_found', message: 'Product not found' },
        { status: 404 }
      )
    }

    // Validate product status
    if (product.status !== 'active') {
      return NextResponse.json(
        { 
          ok: false, 
          reason: 'inactive', 
          message: 'Product is not available',
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            currency: product.currency,
            image: product.images?.[0] || '',
          }
        },
        { status: 400 }
      )
    }

    // Validate stock
    if (product.stock != null && product.stock <= 0) {
      return NextResponse.json(
        { 
          ok: false, 
          reason: 'out_of_stock', 
          message: 'Product is out of stock',
          product: {
            id: product.id,
            name: product.name,
            price: product.price,
            currency: product.currency,
            image: product.images?.[0] || '',
          }
        },
        { status: 400 }
      )
    }

    // Product is valid
    return NextResponse.json({
      ok: true,
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        image: product.images?.[0] || '',
      }
    })

  } catch (error: unknown) {
    console.error('[validate-product] Unexpected error:', error)
    return NextResponse.json(
      { 
        ok: false, 
        reason: 'server_error', 
        message: 'An unexpected error occurred' 
      },
      { status: 500 }
    )
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}
