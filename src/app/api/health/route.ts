/**
 * Health check endpoint for platform probe and self-check.
 * GET /api/health
 * - 200: Supabase reachable, app can serve traffic.
 * - 503: Env missing or Supabase unreachable.
 * Does not expose internal details.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const supabase = await getSupabaseAdmin()
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error) {
      return NextResponse.json({ status: 'unavailable' }, { status: 503 })
    }
    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 })
  }
}
