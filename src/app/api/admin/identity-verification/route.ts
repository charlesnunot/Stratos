/**
 * GET /api/admin/identity-verification — 管理员获取待审核实名认证列表（含证件图 signed URL）
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const SIGNED_URL_EXPIRES = 3600 // 1 hour

export async function GET(request: NextRequest) {
  const authResult = await requireAdminOrSupport(request)
  if (!authResult.success) return authResult.response

  const admin = await getSupabaseAdmin()

  const { data: rows, error } = await admin
    .from('identity_verifications')
    .select('user_id, real_name, id_number, id_card_front_path, id_card_back_path, status, rejected_reason, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to load' },
      { status: 500 }
    )
  }

  const list: Array<{
    user_id: string
    real_name: string
    id_number_masked: string
    id_card_front_url: string | null
    id_card_back_url: string | null
    created_at: string
  }> = []

  for (const row of rows ?? []) {
    let frontUrl: string | null = null
    let backUrl: string | null = null
    if (row.id_card_front_path) {
      const { data: front } = await admin.storage
        .from('identity-docs')
        .createSignedUrl(row.id_card_front_path, SIGNED_URL_EXPIRES)
      frontUrl = front?.signedUrl ?? null
    }
    if (row.id_card_back_path) {
      const { data: back } = await admin.storage
        .from('identity-docs')
        .createSignedUrl(row.id_card_back_path, SIGNED_URL_EXPIRES)
      backUrl = back?.signedUrl ?? null
    }
    list.push({
      user_id: row.user_id,
      real_name: row.real_name,
      id_number_masked: row.id_number
        ? `${row.id_number.slice(0, 4)}**********${row.id_number.slice(-4)}`
        : '',
      id_card_front_url: frontUrl,
      id_card_back_url: backUrl,
      created_at: row.created_at,
    })
  }

  return NextResponse.json({ list })
}
