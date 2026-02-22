/**
 * 审核通过后自动生成话题：根据帖子正文提取话题，与已有话题合并（不覆盖用户已选话题）。
 * 仅允许 admin/support 调用。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { extractTopicsOnServer } from '@/lib/ai/extract-topics-server'
import { translateOnServer, getTargetLanguageForLocale } from '@/lib/ai/translate-server'
import { detectContentLanguage, detectTopicLanguage } from '@/lib/ai/detect-language'
import { toCanonicalSlug } from '@/lib/utils/slug'
import { logAudit } from '@/lib/api/audit'

type AdminClient = Awaited<ReturnType<typeof getSupabaseAdmin>>

async function ensureCanonicalSlug(
  admin: AdminClient,
  topicId: string,
  nameTranslated: string
): Promise<void> {
  const candidate = toCanonicalSlug(nameTranslated)
  if (!candidate) return

  const { data: existing } = await admin
    .from('topics')
    .select('id')
    .eq('slug', candidate)
    .neq('id', topicId)
    .maybeSingle()

  const slug = existing ? `${candidate}-${topicId.slice(0, 8)}` : candidate
  await admin.from('topics').update({ slug }).eq('id', topicId)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'support') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    let body: { postId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const postId = body?.postId
    if (!postId || typeof postId !== 'string') {
      return NextResponse.json({ error: 'Missing postId' }, { status: 400 })
    }

  const admin = await getSupabaseAdmin()

  const { data: post } = await admin
    .from('posts')
    .select('id, content, content_lang')
    .eq('id', postId)
    .single()
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }
  const content = post.content?.trim()
  if (!content) {
    return NextResponse.json({ ok: true, added: 0 })
  }
  // 审核时按正文检测语言并用于话题，不依赖发布时的页面语言（与 translate-after-publish 一致）
  const contentLang = detectContentLanguage(content)
  const targetLang = getTargetLanguageForLocale(contentLang)

  // 已有话题名称（不区分大小写，用于去重）
  const { data: existingLinks } = await admin
    .from('post_topics')
    .select('topic_id, topics(name)')
    .eq('post_id', postId)
  const existingNames = new Set(
    (existingLinks ?? [])
      .map((r: any) => r.topics?.name?.trim())
      .filter(Boolean)
      .map((n: string) => n.toLowerCase())
  )

  const suggested = await extractTopicsOnServer(content)
  if (suggested.length === 0) {
    return NextResponse.json({ ok: true, added: 0 })
  }

  let added = 0
  for (const topicName of suggested) {
    const nameTrim = topicName.trim()
    if (!nameTrim) continue
    if (existingNames.has(nameTrim.toLowerCase())) continue

    let topicId: string
    const { data: existingTopic } = await admin
      .from('topics')
      .select('id, name_translated, name_lang')
      .ilike('name', nameTrim)
      .limit(1)
      .maybeSingle()
    if (existingTopic?.id) {
      topicId = existingTopic.id
    } else {
      const slug = nameTrim.toLowerCase().replace(/\s+/g, '-').trim() || nameTrim
      const newTopicLang = detectTopicLanguage(nameTrim)
      const { data: newTopic, error: insertTopicError } = await admin
        .from('topics')
        .insert({ name: nameTrim, slug, name_lang: newTopicLang })
        .select('id')
        .single()
      if (insertTopicError || !newTopic?.id) continue
      topicId = newTopic.id
    }

    const { error: linkError } = await admin
      .from('post_topics')
      .insert({ post_id: postId, topic_id: topicId })
    if (!linkError) {
      added++
      existingNames.add(nameTrim.toLowerCase())
    }

    // 话题翻译：若该话题尚无译文则翻译。使用话题专用语言检测（短文本友好），不用正文语言。
    const { data: topicRow } = await admin
      .from('topics')
      .select('id, name, name_translated, name_lang')
      .eq('id', topicId)
      .single()
    const topicLang = topicRow?.name ? detectTopicLanguage(topicRow.name) : contentLang
    const topicTargetLang = getTargetLanguageForLocale(topicLang)
    if (topicRow && !topicRow.name_translated && topicRow.name?.trim()) {
      const translated = await translateOnServer(
        topicRow.name.trim(),
        topicTargetLang,
        'translate_post'
      )
      if (translated) {
        await admin
          .from('topics')
          .update({
            name_translated: translated,
            name_lang: topicLang,
          })
          .eq('id', topicId)
        await ensureCanonicalSlug(admin, topicId, translated)
      }
    } else if (topicRow) {
      // 已有译文的话题也按话题自身语言修正 name_lang，并尽量统一为 ASCII slug
      await admin
        .from('topics')
        .update({ name_lang: topicLang })
        .eq('id', topicId)
      if (topicRow.name_translated?.trim()) {
        await ensureCanonicalSlug(admin, topicId, topicRow.name_translated.trim())
      }
    }
  }

  if (added > 0) {
    logAudit({
      action: 'ai_extract_topics',
      userId: user.id,
      resourceId: postId,
      resourceType: 'post',
      result: 'success',
      timestamp: new Date().toISOString(),
      meta: { topicsAdded: added },
    })
  }
  return NextResponse.json({ ok: true, added })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[extract-topics-after-approval] Error:', error)
    }
    const message = error instanceof Error ? error.message : 'Topic extraction failed'
    
    // Log failure without blocking the approval process
    logAudit({
      action: 'ai_extract_topics',
      userId: user.id,
      resourceId: 'unknown',
      resourceType: 'post',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: message },
    })

    return NextResponse.json(
      { ok: false, error: message, added: 0 },
      { status: 500 }
    )
  }
}
