/**
 * 服务端校验商品是否可购买（Buy Now / 加购前）。
 * 单一权威入口：与商品页渲染使用同一 session/RLS，避免客户端再查 products 的时序与 RLS 差异。
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
      return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : null
    if (!productId) {
      return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 })
    }

    const { data: product, error } = await supabase
      .from('products')
      .select('id, status, stock, price, currency, name, images')
      .eq('id', productId)
      .single()

    if (error || !product) {
      return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 200 })
    }

    if (product.status !== 'active') {
      return NextResponse.json({ ok: false, reason: 'inactive' }, { status: 200 })
    }

    const stock = product.stock ?? 0
    if (stock <= 0) {
      return NextResponse.json({ ok: false, reason: 'out_of_stock' }, { status: 200 })
    }

    return NextResponse.json({
      ok: true,
      product: {
        id: product.id,
        price: product.price,
        currency: product.currency ?? 'USD',
        name: product.name ?? '',
        image: Array.isArray(product.images) ? product.images[0] ?? '' : '',
      },
    })
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[validate-product]', err)
    }
    return NextResponse.json({ ok: false, reason: 'server_error' }, { status: 500 })
  }
}
