/**
 * 资料审核通过后：根据 display_name、bio、location 检测语言并翻译到另一语言，
 * 写回 display_name_translated、bio_translated、location_translated、content_lang。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { translateOnServer, getTargetLanguageForLocale } from '@/lib/ai/translate-server'
import { detectContentLanguage } from '@/lib/ai/detect-language'
import { logAudit } from '@/lib/api/audit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    let body: { profileId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const profileId = body?.profileId
    if (!profileId || typeof profileId !== 'string') {
      return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
    }

  const admin = await getSupabaseAdmin()
  const { data: row } = await admin
    .from('profiles')
    .select('id, display_name, bio, location, content_lang')
    .eq('id', profileId)
    .single()

  if (!row) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const text = [row.display_name?.trim(), row.bio?.trim(), row.location?.trim()].filter(Boolean).join('\n')
  if (!text) {
    return NextResponse.json({ ok: true, translated: false })
  }

  const detectedLang = detectContentLanguage(text)
  const targetLang = getTargetLanguageForLocale(detectedLang)
  let displayNameTranslated: string | null = null
  let bioTranslated: string | null = null
  let locationTranslated: string | null = null

  if (row.display_name?.trim()) {
    displayNameTranslated = await translateOnServer(row.display_name.trim(), targetLang, 'translate_profile')
  }
  if (row.bio?.trim()) {
    bioTranslated = await translateOnServer(row.bio.trim(), targetLang, 'translate_profile')
  }
  if (row.location?.trim()) {
    locationTranslated = await translateOnServer(row.location.trim(), targetLang, 'translate_profile')
  }

  if (displayNameTranslated !== null || bioTranslated !== null || locationTranslated !== null) {
    await admin
      .from('profiles')
      .update({
        ...(displayNameTranslated !== null && { display_name_translated: displayNameTranslated }),
        ...(bioTranslated !== null && { bio_translated: bioTranslated }),
        ...(locationTranslated !== null && { location_translated: locationTranslated }),
        content_lang: detectedLang,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)
    logAudit({
      action: 'ai_translate_profile',
      userId: user.id,
      resourceId: profileId,
      resourceType: 'profile',
      result: 'success',
      timestamp: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    ok: true,
    translated: !!(displayNameTranslated || bioTranslated || locationTranslated),
  })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[translate-profile-after-approval] Error:', error)
    }
    const message = error instanceof Error ? error.message : 'Profile translation failed'
    
    // Log failure without blocking the approval process
    logAudit({
      action: 'ai_translate_profile',
      userId: user.id,
      resourceId: 'unknown',
      resourceType: 'profile',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: message },
    })

    return NextResponse.json(
      { ok: false, error: message, translated: false },
      { status: 500 }
    )
  }
}
