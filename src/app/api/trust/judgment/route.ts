/**
 * Phase 2 trust judgment: GET judgment + evidence for product/seller.
 * 70% rules, 3 tiers only (low_risk | medium_risk | high_risk), 责任主体 in i18n keys.
 * 阈值来自 src/lib/trust-judgment/config.ts 可调参数表。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRUST_JUDGMENT_CONFIG } from '@/lib/trust-judgment/config'

const LEVEL_LOW = 'low_risk'
const LEVEL_MEDIUM = 'medium_risk'
const LEVEL_HIGH = 'high_risk'

type Level = typeof LEVEL_LOW | typeof LEVEL_MEDIUM | typeof LEVEL_HIGH

export interface TrustEvidenceItem {
  labelKey: string
  value?: string | number
}

export interface TrustJudgmentResponse {
  level: Level
  recommendationKey: string
  evidence: TrustEvidenceItem[]
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')?.trim()
    const sellerId = searchParams.get('sellerId')?.trim()

    if (!productId || !sellerId) {
      return NextResponse.json(
        { error: 'missing productId or sellerId' },
        { status: 400 }
      )
    }

    const {
      dispute_window_days,
      high_risk_dispute_threshold,
      new_seller_order_threshold,
      price_deviation_ratio,
      price_history_window_days,
    } = TRUST_JUDGMENT_CONFIG

    const [productRow, sellerStatsRows, priceRangeRows] = await Promise.all([
      supabase
        .from('products')
        .select('id, seller_id, price, status')
        .eq('id', productId)
        .single(),
      supabase.rpc('get_seller_trust_stats', {
        p_seller_id: sellerId,
        p_dispute_days: dispute_window_days,
      }),
      supabase.rpc('get_product_price_range', {
        p_product_id: productId,
        p_days: price_history_window_days,
      }),
    ])

    const product = productRow.data
    const sellerStatsArr = (sellerStatsRows.data as { completed_orders_count: number; disputes_last_90_days: number }[] | null) ?? []
    const priceRangeArr = (priceRangeRows.data as { min_price: number; max_price: number; sample_count: number }[] | null) ?? []
    const sellerStats = sellerStatsArr[0] ?? null
    const priceRange = priceRangeArr[0] ?? null

    if (productRow.error || !product) {
      return NextResponse.json({ error: 'product_not_found' }, { status: 404 })
    }
    if (product.seller_id !== sellerId) {
      return NextResponse.json({ error: 'seller_mismatch' }, { status: 400 })
    }
    if (product.status !== 'active') {
      return NextResponse.json({ error: 'product_inactive' }, { status: 400 })
    }

    const completedOrders = Number(sellerStats?.completed_orders_count ?? 0)
    const disputes90 = Number(sellerStats?.disputes_last_90_days ?? 0)
    const currentPrice = Number(product.price ?? 0)
    const minPrice = priceRange ? Number(priceRange.min_price) : null
    const maxPrice = priceRange ? Number(priceRange.max_price) : null
    const sampleCount = priceRange ? Number(priceRange.sample_count) : 0

    const priceAboveRange =
      maxPrice != null &&
      maxPrice > 0 &&
      currentPrice > maxPrice * price_deviation_ratio

    let level: Level = LEVEL_LOW
    if (disputes90 >= high_risk_dispute_threshold) {
      level = LEVEL_HIGH
    } else if (
      completedOrders <= new_seller_order_threshold ||
      priceAboveRange
    ) {
      level = LEVEL_MEDIUM
    }

    const recommendationKey =
      level === LEVEL_LOW
        ? 'recommendationLowRisk'
        : level === LEVEL_MEDIUM
          ? 'recommendationMediumRisk'
          : 'recommendationHighRisk'

    const evidence: TrustEvidenceItem[] = []
    evidence.push({
      labelKey: 'evidenceCompletedOrders',
      value: completedOrders,
    })
    if (disputes90 === 0) {
      evidence.push({ labelKey: 'evidenceDisputes90None' })
    } else {
      evidence.push({
        labelKey: 'evidenceDisputes90Count',
        value: disputes90,
      })
    }
    if (sampleCount > 0) {
      if (priceAboveRange) {
        evidence.push({ labelKey: 'evidencePriceAboveRange' })
      } else {
        evidence.push({ labelKey: 'evidencePriceInRange' })
      }
    }

    const body: TrustJudgmentResponse = {
      level,
      recommendationKey,
      evidence,
    }

    return NextResponse.json(body)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[trust/judgment]', err)
    }
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 }
    )
  }
}
