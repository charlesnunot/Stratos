/**
 * 动态获取商品分类列表（非硬编码，由 AI 生成/用户填写，便于扩展）。
 * 返回 distinct category 及对应 content_lang / category_translated，供筛选下拉按 locale 显示译文。
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  // 每个 distinct category 取一条记录（含 content_lang、category_translated）用于前端 getDisplayContent 展示
  const { data, error } = await supabase
    .from('products')
    .select('category, category_translated, content_lang')
    .eq('status', 'active')
    .not('category', 'is', null)
    .not('category', 'eq', '')

  if (error) {
    console.error('[api/products/categories]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const list: Array<{
    value: string
    content_lang: 'zh' | 'en' | null
    category: string
    category_translated: string | null
  }> = []
  for (const row of data ?? []) {
    const cat = (row.category ?? '').trim()
    if (!cat || seen.has(cat)) continue
    seen.add(cat)
    list.push({
      value: cat,
      content_lang: (row.content_lang as 'zh' | 'en') ?? null,
      category: cat,
      category_translated: row.category_translated ?? null,
    })
  }
  list.sort((a, b) => a.category.localeCompare(b.category))

  return NextResponse.json(list)
}
