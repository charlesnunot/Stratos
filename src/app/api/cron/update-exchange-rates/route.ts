/**
 * Cron job: Fetch daily USD rates from ExchangeRate-API and write to exchange_rates.
 * Should be called once per day (e.g. Vercel Cron at 0 0 * * * UTC).
 * Backend convert_to_usd() uses: base_currency -> target_currency 'USD', rate = USD per 1 base.
 * API returns 1 USD = X foreign, so we store (foreign, USD, 1/X).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'

const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD'

const SUPPORTED_CURRENCIES = ['CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'] as const

function startOfTodayUTC(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function startOfTomorrowUTC(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const { verifyCronSecret } = await import('@/lib/cron/verify-cron-secret')
    const unauth = verifyCronSecret(request)
    if (unauth) return unauth
    const res = await fetch(EXCHANGE_API_URL)
    if (!res.ok) {
      const text = await res.text()
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron update-exchange-rates] API error:', res.status, text)
      }
      const supabase = await getSupabaseAdmin()
      try {
        await supabase.from('cron_logs').insert({
          job_name: 'update_exchange_rates',
          status: 'failed',
          execution_time_ms: Date.now() - startTime,
          executed_at: new Date().toISOString(),
          error_message: `Exchange API failed: ${res.status}`,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: `Exchange API failed: ${res.status}` },
        { status: 502 }
      )
    }

    const data = (await res.json()) as { base: string; rates: Record<string, number> }
    const rates = data.rates || {}

    const validFrom = startOfTodayUTC()
    const validUntil = startOfTomorrowUTC()
    const supabase = await getSupabaseAdmin()

    // Delete existing rows for today (same valid_from day) so we are idempotent
    const { error: deleteError } = await supabase
      .from('exchange_rates')
      .delete()
      .eq('target_currency', 'USD')
      .gte('valid_from', validFrom)
      .lt('valid_from', validUntil)

    if (deleteError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron update-exchange-rates] Delete error:', deleteError)
      }
      try {
        await supabase.from('cron_logs').insert({
          job_name: 'update_exchange_rates',
          status: 'failed',
          execution_time_ms: Date.now() - startTime,
          executed_at: new Date().toISOString(),
          error_message: deleteError.message,
        })
      } catch (_) {}
      return NextResponse.json(
        { error: deleteError.message || 'Failed to clear old rates' },
        { status: 500 }
      )
    }

    const rows: Array<{
      base_currency: string
      target_currency: string
      rate: number
      source: string
      valid_from: string
      valid_until: string | null
    }> = []

    for (const code of SUPPORTED_CURRENCIES) {
      const usdPerUnit = rates[code]
      if (usdPerUnit == null || usdPerUnit <= 0) continue
      const rateToUsd = 1 / usdPerUnit
      rows.push({
        base_currency: code,
        target_currency: 'USD',
        rate: Math.round(rateToUsd * 1e8) / 1e8,
        source: 'api',
        valid_from: validFrom,
        valid_until: validUntil,
      })
    }

    if (rows.length === 0) {
      try {
        await supabase.from('cron_logs').insert({
          job_name: 'update_exchange_rates',
          status: 'failed',
          execution_time_ms: Date.now() - startTime,
          executed_at: new Date().toISOString(),
          error_message: 'No rates parsed from API',
        })
      } catch (_) {}
      logAudit({
        action: 'cron_update_exchange_rates',
        resourceType: 'cron',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: 'No rates parsed', rates_keys: Object.keys(rates) },
      })
      return NextResponse.json(
        { error: 'No rates parsed from API', rates: Object.keys(rates) },
        { status: 502 }
      )
    }

    const { error: insertError } = await supabase.from('exchange_rates').insert(rows)

    if (insertError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Cron update-exchange-rates] Insert error:', insertError)
      }
      try {
        await supabase.from('cron_logs').insert({
          job_name: 'update_exchange_rates',
          status: 'failed',
          execution_time_ms: Date.now() - startTime,
          executed_at: new Date().toISOString(),
          error_message: insertError.message,
        })
      } catch (_) {}
      logAudit({
        action: 'cron_update_exchange_rates',
        resourceType: 'cron',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: insertError.message },
      })
      return NextResponse.json(
        { error: insertError.message || 'Failed to insert rates' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime
    try {
      await supabase.from('cron_logs').insert({
        job_name: 'update_exchange_rates',
        status: 'success',
        execution_time_ms: duration,
        executed_at: new Date().toISOString(),
        metadata: { updated: rows.length, currencies: rows.map((r) => r.base_currency) },
      })
    } catch (_) {}

    logAudit({
      action: 'cron_update_exchange_rates',
      resourceType: 'cron',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { updated: rows.length, currencies: rows.map((r) => r.base_currency) },
    })

    return NextResponse.json({
      success: true,
      updated: rows.length,
      valid_from: validFrom,
      currencies: rows.map((r) => r.base_currency),
    })
  } catch (err: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Cron update-exchange-rates] Error:', err)
    }
    const message = err instanceof Error ? err.message : 'Internal error'
    try {
      const supabase = await getSupabaseAdmin()
      await supabase.from('cron_logs').insert({
        job_name: 'update_exchange_rates',
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        executed_at: new Date().toISOString(),
        error_message: message,
      })
    } catch (_) {}
    logAudit({
      action: 'cron_update_exchange_rates',
      resourceType: 'cron',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: message },
    })
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
