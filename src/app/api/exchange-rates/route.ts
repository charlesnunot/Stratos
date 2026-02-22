/**
 * Exchange rates API
 * Returns current exchange rate from database or fallback rates
 * Supports caching for performance
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Currency } from '@/lib/currency/detect-currency'

/** Fallback rates when database is not available (USD to target) */
const FALLBACK_RATES: Record<Exclude<Currency, 'USD'>, number> = {
  CNY: 7.2,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 150,
  KRW: 1300,
  SGD: 1.34,
  HKD: 7.82,
  AUD: 1.53,
  CAD: 1.36,
}

export interface ExchangeRateResponse {
  from: Currency
  to: Currency
  rate: number
  validFrom: string
  validUntil?: string
  source: 'database' | 'fallback'
  cached?: boolean
}

/**
 * Get exchange rate from database
 * Looks for the most recent valid rate
 */
async function getRateFromDatabase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: Currency,
  to: Currency
): Promise<{ rate: number; validFrom: string; validUntil?: string } | null> {
  if (from === to) {
    return { rate: 1, validFrom: new Date().toISOString() }
  }

  try {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('rate, valid_from, valid_until')
      .eq('base_currency', from)
      .eq('target_currency', to)
      .lte('valid_from', new Date().toISOString())
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return {
      rate: data.rate,
      validFrom: data.valid_from,
      validUntil: data.valid_until || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Get fallback rate
 * Uses fixed rates when database is not available
 */
function getFallbackRate(from: Currency, to: Currency): number {
  if (from === to) return 1

  // Convert to USD first
  let amountInUsd: number
  if (from === 'USD') {
    amountInUsd = 1
  } else {
    const rateToUsd = 1 / (FALLBACK_RATES[from] ?? 1)
    amountInUsd = rateToUsd
  }

  // Convert from USD to target
  if (to === 'USD') return amountInUsd

  const rate = FALLBACK_RATES[to] ?? 1
  return amountInUsd * rate
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = (searchParams.get('from') || 'USD') as Currency
    const to = (searchParams.get('to') || 'CNY') as Currency

    // Validate currencies
    const validCurrencies: Currency[] = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']
    if (!validCurrencies.includes(from) || !validCurrencies.includes(to)) {
      return NextResponse.json(
        { error: 'Invalid currency. Supported: USD, CNY, EUR, GBP, JPY, KRW, SGD, HKD, AUD, CAD' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Try to get rate from database
    const dbRate = await getRateFromDatabase(supabase, from, to)

    if (dbRate) {
      const response: ExchangeRateResponse = {
        from,
        to,
        rate: dbRate.rate,
        validFrom: dbRate.validFrom,
        validUntil: dbRate.validUntil,
        source: 'database',
      }
      return NextResponse.json(response)
    }

    // Fallback to fixed rates
    const fallbackRate = getFallbackRate(from, to)
    const response: ExchangeRateResponse = {
      from,
      to,
      rate: fallbackRate,
      validFrom: new Date().toISOString(),
      source: 'fallback',
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Exchange Rates API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get exchange rate' },
      { status: 500 }
    )
  }
}

/**
 * Batch get multiple exchange rates
 * POST /api/exchange-rates
 * Body: { pairs: [{from: 'USD', to: 'CNY'}, ...] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pairs } = body as { pairs: Array<{ from: Currency; to: Currency }> }

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request. Expected { pairs: [{from, to}, ...] }' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const results: ExchangeRateResponse[] = []

    for (const { from, to } of pairs) {
      // Try database first
      const dbRate = await getRateFromDatabase(supabase, from, to)

      if (dbRate) {
        results.push({
          from,
          to,
          rate: dbRate.rate,
          validFrom: dbRate.validFrom,
          validUntil: dbRate.validUntil,
          source: 'database',
        })
      } else {
        // Fallback
        results.push({
          from,
          to,
          rate: getFallbackRate(from, to),
          validFrom: new Date().toISOString(),
          source: 'fallback',
        })
      }
    }

    return NextResponse.json({ rates: results })
  } catch (error) {
    console.error('[Exchange Rates API] Batch error:', error)
    return NextResponse.json(
      { error: 'Failed to get exchange rates' },
      { status: 500 }
    )
  }
}
