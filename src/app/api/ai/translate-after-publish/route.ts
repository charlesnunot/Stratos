/**
 * 审核通过后翻译接口
 * 支持 type: post | product | comment | product_comment
 * 根据类型读取/写回对应的翻译字段
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { translateOnServer, getTargetLanguageForLocale } from '@/lib/ai/translate-server'
import { detectContentLanguage } from '@/lib/ai/detect-language'
import { logAudit } from '@/lib/api/audit'

type ContentType = 'post' | 'product' | 'comment' | 'product_comment'

const TABLE_MAP: Record<ContentType, string> = {
  post: 'posts',
  product: 'products',
  comment: 'comments',
  product_comment: 'product_comments',
}

const ID_FIELD_MAP: Record<ContentType, string> = {
  post: 'id',
  product: 'id',
  comment: 'id',
  product_comment: 'id',
}

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

  // Check if DEEPSEEK_API_KEY is configured
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!deepseekApiKey) {
    console.error('[translate-after-publish] DEEPSEEK_API_KEY is not configured')
    await logAudit({
      action: 'ai_translate_config_check',
      userId: user.id,
      resourceId: 'system',
      resourceType: 'system',
      result: 'fail',
      timestamp: new Date().toISOString(),
      meta: { reason: 'missing_api_key', message: 'DEEPSEEK_API_KEY is not configured' },
    })
    return NextResponse.json({ error: 'Translation service not configured' }, { status: 500 })
  }

  try {
    let body: { type?: ContentType; id?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const type = body?.type
    const id = body?.id
    
    console.log('[translate-after-publish] Starting translation', { type, id })

    if (!type || !['post', 'product', 'comment', 'product_comment'].includes(type)) {
      return NextResponse.json(
        { error: 'Missing or invalid type. Must be post, product, comment, or product_comment' },
        { status: 400 }
      )
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const admin = await getSupabaseAdmin()
    const table = TABLE_MAP[type]
    const idField = ID_FIELD_MAP[type]

    let selectFields = ''
    let updatePayload: Record<string, unknown> = {}
    let auditAction = ''
    let auditResourceType = type

    if (type === 'product') {
      selectFields = 'id, name, description, details, faq, category, content_lang'
      const { data: row } = await admin.from(table).select(selectFields).eq(idField, id).single()
      if (!row) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }

      const product = row as unknown as {
        id: string
        name: string | null
        description: string | null
        details: string | null
        faq: unknown
        category: string | null
        content_lang: string | null
      }

      const text = [
        product.name?.trim(),
        product.description?.trim(),
        product.details?.trim(),
        product.category?.trim(),
      ].filter(Boolean).join('\n')

      const detectedLang = text ? detectContentLanguage(text) : (product.content_lang as 'zh' | 'en') || 'zh'
      const targetLang = getTargetLanguageForLocale(detectedLang)

      let nameTranslated: string | null = null
      let descriptionTranslated: string | null = null
      let detailsTranslated: string | null = null
      let faqTranslated: unknown = null
      let categoryTranslated: string | null = null

      if (product.name?.trim()) {
        nameTranslated = await translateOnServer(product.name.trim(), targetLang, 'translate_product')
        if (!nameTranslated) {
          console.warn('[translate-after-publish] Product name translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_product',
            userId: user.id,
            resourceId: id,
            resourceType: 'product',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'name', reason: 'translation_null', targetLang },
          })
        }
      }
      if (product.description?.trim()) {
        descriptionTranslated = await translateOnServer(product.description.trim(), targetLang, 'translate_product')
        if (!descriptionTranslated) {
          console.warn('[translate-after-publish] Product description translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_product',
            userId: user.id,
            resourceId: id,
            resourceType: 'product',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'description', reason: 'translation_null', targetLang },
          })
        }
      }
      if (product.details?.trim()) {
        detailsTranslated = await translateOnServer(product.details.trim(), targetLang, 'translate_product')
        if (!detailsTranslated) {
          console.warn('[translate-after-publish] Product details translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_product',
            userId: user.id,
            resourceId: id,
            resourceType: 'product',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'details', reason: 'translation_null', targetLang },
          })
        }
      }
      if (product.category?.trim()) {
        categoryTranslated = await translateOnServer(product.category.trim(), targetLang, 'translate_product')
        if (!categoryTranslated) {
          console.warn('[translate-after-publish] Product category translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_product',
            userId: user.id,
            resourceId: id,
            resourceType: 'product',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'category', reason: 'translation_null', targetLang },
          })
        }
      }

      if (product.faq && Array.isArray(product.faq) && product.faq.length > 0) {
        faqTranslated = await Promise.all(
          product.faq.map(async (item: { question: string; answer: string }) => {
            const questionTranslated = item.question?.trim()
              ? await translateOnServer(item.question.trim(), targetLang, 'translate_product')
              : null
            const answerTranslated = item.answer?.trim()
              ? await translateOnServer(item.answer.trim(), targetLang, 'translate_product')
              : null
            return {
              question: questionTranslated || item.question,
              answer: answerTranslated || item.answer,
            }
          })
        )
      }

      updatePayload = {
        ...(nameTranslated !== null && { name_translated: nameTranslated }),
        ...(descriptionTranslated !== null && { description_translated: descriptionTranslated }),
        ...(detailsTranslated !== null && { details_translated: detailsTranslated }),
        ...(categoryTranslated !== null && { category_translated: categoryTranslated }),
        ...(faqTranslated !== null && { faq_translated: faqTranslated }),
        content_lang: detectedLang,
        updated_at: new Date().toISOString(),
      }

      auditAction = 'ai_translate_product'
    } else if (type === 'comment') {
      selectFields = 'id, content, content_lang'
      const { data: row } = await admin.from(table).select(selectFields).eq(idField, id).single()
      if (!row) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
      }

      const comment = row as unknown as { id: string; content: string | null; content_lang: string | null }
      const text = comment.content?.trim() || ''
      const detectedLang = text ? detectContentLanguage(text) : (comment.content_lang as 'zh' | 'en') || 'zh'
      const targetLang = getTargetLanguageForLocale(detectedLang)

      let contentTranslated: string | null = null
      if (text) {
        contentTranslated = await translateOnServer(text, targetLang, 'translate_comment')
        if (!contentTranslated) {
          console.warn('[translate-after-publish] Comment translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_comment',
            userId: user.id,
            resourceId: id,
            resourceType: 'comment',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'content', reason: 'translation_null', targetLang },
          })
        }
      }

      updatePayload = {
        ...(contentTranslated !== null && { content_translated: contentTranslated }),
        content_lang: detectedLang,
        updated_at: new Date().toISOString(),
      }

      auditAction = 'ai_translate_comment'
    } else if (type === 'product_comment') {
      selectFields = 'id, content, content_lang'
      const { data: row } = await admin.from(table).select(selectFields).eq(idField, id).single()
      if (!row) {
        return NextResponse.json({ error: 'Product comment not found' }, { status: 404 })
      }

      const productComment = row as unknown as { id: string; content: string | null; content_lang: string | null }
      const text = productComment.content?.trim() || ''
      const detectedLang = text ? detectContentLanguage(text) : (productComment.content_lang as 'zh' | 'en') || 'zh'
      const targetLang = getTargetLanguageForLocale(detectedLang)

      let contentTranslated: string | null = null
      if (text) {
        contentTranslated = await translateOnServer(text, targetLang, 'translate_comment')
        if (!contentTranslated) {
          console.warn('[translate-after-publish] Product comment translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_product_comment',
            userId: user.id,
            resourceId: id,
            resourceType: 'product_comment',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'content', reason: 'translation_null', targetLang },
          })
        }
      }

      updatePayload = {
        ...(contentTranslated !== null && { content_translated: contentTranslated }),
        content_lang: detectedLang,
        updated_at: new Date().toISOString(),
      }

      auditAction = 'ai_translate_product_comment'
    } else if (type === 'post') {
      selectFields = 'id, content, content_lang, title, description'
      const { data: row } = await admin.from(table).select(selectFields).eq(idField, id).single()
      if (!row) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 })
      }

      const post = row as unknown as {
        id: string
        content: string | null
        content_lang: string | null
        title: string | null
        description: string | null
      }

      const text = [
        post.title?.trim(),
        post.description?.trim(),
        post.content?.trim(),
      ].filter(Boolean).join('\n')

      const detectedLang = text ? detectContentLanguage(text) : (post.content_lang as 'zh' | 'en') || 'zh'
      const targetLang = getTargetLanguageForLocale(detectedLang)

      let titleTranslated: string | null = null
      let descriptionTranslated: string | null = null
      let contentTranslated: string | null = null

      if (post.title?.trim()) {
        titleTranslated = await translateOnServer(post.title.trim(), targetLang, 'translate_post')
        if (!titleTranslated) {
          console.warn('[translate-after-publish] Post title translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_post',
            userId: user.id,
            resourceId: id,
            resourceType: 'post',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'title', reason: 'translation_null', targetLang },
          })
        }
      }
      if (post.description?.trim()) {
        descriptionTranslated = await translateOnServer(post.description.trim(), targetLang, 'translate_post')
        if (!descriptionTranslated) {
          console.warn('[translate-after-publish] Post description translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_post',
            userId: user.id,
            resourceId: id,
            resourceType: 'post',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'description', reason: 'translation_null', targetLang },
          })
        }
      }
      if (post.content?.trim()) {
        contentTranslated = await translateOnServer(post.content.trim(), targetLang, 'translate_post')
        if (!contentTranslated) {
          console.warn('[translate-after-publish] Post content translation returned null', { id, targetLang })
          await logAudit({
            action: 'ai_translate_post',
            userId: user.id,
            resourceId: id,
            resourceType: 'post',
            result: 'fail',
            timestamp: new Date().toISOString(),
            meta: { field: 'content', reason: 'translation_null', targetLang },
          })
        }
      }

      updatePayload = {
        ...(titleTranslated !== null && { title_translated: titleTranslated }),
        ...(descriptionTranslated !== null && { description_translated: descriptionTranslated }),
        ...(contentTranslated !== null && { content_translated: contentTranslated }),
        content_lang: detectedLang,
        updated_at: new Date().toISOString(),
      }

      auditAction = 'ai_translate_post'
    }

    if (Object.keys(updatePayload).length > 0) {
      await admin.from(table).update(updatePayload).eq(idField, id)

      logAudit({
        action: auditAction,
        userId: user.id,
        resourceId: id,
        resourceType: auditResourceType,
        result: 'success',
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      ok: true,
      translated: Object.keys(updatePayload).length > 0,
    })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[translate-after-publish] Error:', error)
    }
    const message = error instanceof Error ? error.message : 'Translation failed'

    logAudit({
      action: 'ai_translate',
      userId: user?.id || 'unknown',
      resourceId: 'unknown',
      resourceType: 'unknown',
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
