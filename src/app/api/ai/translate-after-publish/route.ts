/**
 * 发布后自动翻译：根据 type + id 加载内容，调用 AI 翻译，写回 content_translated / name_translated + description_translated。
 * 审核通过时根据正文检测语言并写回 content_lang，保证与译文一致，用户发布时可不限页面语言。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { translateOnServer, getTargetLanguageForLocale } from '@/lib/ai/translate-server'
import { detectContentLanguage } from '@/lib/ai/detect-language'
import { logAudit } from '@/lib/api/audit'

type Body = { type: 'post' | 'comment' | 'product' | 'product_comment'; id: string }

async function canTriggerTranslation(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string }, type: string, row: { user_id?: string; seller_id?: string } | null): Promise<boolean> {
  if (!row) return false
  const ownerId = type === 'product' ? (row as { seller_id?: string }).seller_id : (row as { user_id?: string }).user_id
  if (ownerId === user.id) return true
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' || profile?.role === 'support'
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

  let body: Body | undefined
  try {
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { type, id } = body
    if (!type || !id || !['post', 'comment', 'product', 'product_comment'].includes(type)) {
      return NextResponse.json({ error: 'Missing or invalid type/id' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()

  if (type === 'post') {
    const { data: row } = await admin.from('posts').select('id, user_id, content, content_lang').eq('id', id).single()
    if (!row || !(await canTriggerTranslation(supabase, user, 'post', row))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const text = row.content?.trim()
    if (!text) {
      return NextResponse.json({ ok: true, translated: false })
    }
    const detectedLang = detectContentLanguage(text)
    const targetLang = getTargetLanguageForLocale(detectedLang)
    const translated = await translateOnServer(text, targetLang, 'translate_post')
    if (translated) {
      await admin.from('posts').update({ content_translated: translated, content_lang: detectedLang }).eq('id', id)
      logAudit({
        action: 'ai_translate_post',
        userId: user.id,
        resourceId: id,
        resourceType: 'post',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
    }
    // 帖子审核通过后顺带翻译该帖下所有评论（检测语言并写回 content_lang），不单独为评论消费 AI
    const { data: comments } = await admin
      .from('comments')
      .select('id, content, content_lang')
      .eq('post_id', id)
    for (const comment of comments ?? []) {
      const commentText = comment.content?.trim()
      if (!commentText) continue
      const commentDetected = detectContentLanguage(commentText)
      const commentTarget = getTargetLanguageForLocale(commentDetected)
      const commentTranslated = await translateOnServer(commentText, commentTarget, 'translate_comment')
      if (commentTranslated) {
        await admin
          .from('comments')
          .update({ content_translated: commentTranslated, content_lang: commentDetected })
          .eq('id', comment.id)
        logAudit({
          action: 'ai_translate_comment',
          userId: user.id,
          resourceId: comment.id,
          resourceType: 'comment',
          result: 'success',
          timestamp: new Date().toISOString(),
        })
      }
    }
    return NextResponse.json({ ok: true, translated: !!translated })
  }

  if (type === 'comment') {
    const { data: row } = await admin
      .from('comments')
      .select('id, user_id, content, content_lang')
      .eq('id', id)
      .single()
    if (!row || !(await canTriggerTranslation(supabase, user, 'comment', row))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const text = row.content?.trim()
    if (!text) {
      return NextResponse.json({ ok: true, translated: false })
    }
    const detectedLang = detectContentLanguage(text)
    const targetLang = getTargetLanguageForLocale(detectedLang)
    const translated = await translateOnServer(text, targetLang, 'translate_comment')
    if (translated) {
      await admin.from('comments').update({ content_translated: translated, content_lang: detectedLang }).eq('id', id)
      logAudit({
        action: 'ai_translate_comment',
        userId: user.id,
        resourceId: id,
        resourceType: 'comment',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
    }
    return NextResponse.json({ ok: true, translated: !!translated })
  }

  if (type === 'product_comment') {
    const { data: row } = await admin
      .from('product_comments')
      .select('id, user_id, content, content_lang')
      .eq('id', id)
      .single()
    if (!row || !(await canTriggerTranslation(supabase, user, 'product_comment', row))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const text = row.content?.trim()
    if (!text) {
      return NextResponse.json({ ok: true, translated: false })
    }
    const detectedLang = detectContentLanguage(text)
    const targetLang = getTargetLanguageForLocale(detectedLang)
    const translated = await translateOnServer(text, targetLang, 'translate_comment')
    if (translated) {
      await admin
        .from('product_comments')
        .update({ content_translated: translated, content_lang: detectedLang })
        .eq('id', id)
      logAudit({
        action: 'ai_translate_product_comment',
        userId: user.id,
        resourceId: id,
        resourceType: 'product_comment',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
    }
    return NextResponse.json({ ok: true, translated: !!translated })
  }

  // product: 翻译标题、描述、详情、FAQ、分类；审核通过时根据正文检测并写回 content_lang
  const { data: row } = await admin
    .from('products')
    .select('id, seller_id, name, description, details, faq, category, content_lang')
    .eq('id', id)
    .single()
  if (!row || !(await canTriggerTranslation(supabase, user, 'product', row))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const productText = [
    row.name?.trim(),
    row.description?.trim(),
    (row as { details?: string | null }).details?.trim(),
    (row as { category?: string | null }).category?.trim(),
  ]
    .filter(Boolean)
    .join('\n')
  const detectedLang = productText ? detectContentLanguage(productText) : (row.content_lang as 'zh' | 'en') || 'zh'
  const targetLang = getTargetLanguageForLocale(detectedLang)

  let nameTranslated: string | null = null
  let descriptionTranslated: string | null = null
  let detailsTranslated: string | null = null
  let categoryTranslated: string | null = null
  let faqTranslated: Array<{ question: string; answer: string }> | null = null

  if (row.name?.trim()) {
    nameTranslated = await translateOnServer(row.name.trim(), targetLang, 'translate_product')
  }
  if (row.description?.trim()) {
    descriptionTranslated = await translateOnServer(row.description.trim(), targetLang, 'translate_product')
  }
  const detailsRaw = (row as { details?: string | null }).details?.trim()
  if (detailsRaw) {
    detailsTranslated = await translateOnServer(detailsRaw, targetLang, 'translate_product')
  }
  const categoryRaw = (row as { category?: string | null }).category?.trim()
  if (categoryRaw) {
    categoryTranslated = await translateOnServer(categoryRaw, targetLang, 'translate_product')
  }

  const faqRaw = (row as { faq?: unknown }).faq
  let faqList: Array<{ question?: string; answer?: string }> = []
  if (Array.isArray(faqRaw)) {
    faqList = faqRaw
  } else if (faqRaw && typeof faqRaw === 'object' && !Array.isArray(faqRaw)) {
    const obj = faqRaw as { question?: string; answer?: string }
    if (typeof obj.question === 'string' || typeof obj.answer === 'string') {
      faqList = [{ question: obj.question ?? '', answer: obj.answer ?? '' }]
    }
  }
  if (faqList.length > 0) {
    const translated: Array<{ question: string; answer: string }> = []
    for (const item of faqList) {
      const q = typeof item.question === 'string' ? item.question.trim() : ''
      const a = typeof item.answer === 'string' ? item.answer.trim() : ''
      if (!q && !a) {
        translated.push({ question: '', answer: '' })
        continue
      }
      const qTrans = q ? await translateOnServer(q, targetLang, 'translate_product') : null
      const aTrans = a ? await translateOnServer(a, targetLang, 'translate_product') : null
      translated.push({
        question: qTrans ?? q,
        answer: aTrans ?? a,
      })
    }
    faqTranslated = translated
  }

  const hasUpdates =
    nameTranslated !== null ||
    descriptionTranslated !== null ||
    detailsTranslated !== null ||
    categoryTranslated !== null ||
    faqTranslated !== null ||
    !!productText
  if (hasUpdates) {
    await admin
      .from('products')
      .update({
        ...(nameTranslated !== null && { name_translated: nameTranslated }),
        ...(descriptionTranslated !== null && { description_translated: descriptionTranslated }),
        ...(detailsTranslated !== null && { details_translated: detailsTranslated }),
        ...(categoryTranslated !== null && { category_translated: categoryTranslated }),
        ...(faqTranslated !== null && { faq_translated: faqTranslated }),
        ...(productText && { content_lang: detectedLang }),
      })
      .eq('id', id)
    if (nameTranslated || descriptionTranslated || detailsTranslated || categoryTranslated || faqTranslated) {
      logAudit({
        action: 'ai_translate_product',
        userId: user.id,
        resourceId: id,
        resourceType: 'product',
        result: 'success',
        timestamp: new Date().toISOString(),
      })
    }
  }
  return NextResponse.json({
    ok: true,
    translated: !!(nameTranslated || descriptionTranslated || detailsTranslated || categoryTranslated || faqTranslated),
  })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[translate-after-publish] Error:', error)
    }
    const message = error instanceof Error ? error.message : 'Translation failed'
    
    // Log failure without blocking the approval process
    logAudit({
      action: `ai_translate_${body?.type || 'unknown'}`,
      userId: user.id,
      resourceId: body?.id || 'unknown',
      resourceType: (body?.type as string) || 'unknown',
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
