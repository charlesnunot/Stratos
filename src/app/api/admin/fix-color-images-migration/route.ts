/**
 * 批量修复颜色图片迁移
 * 用于修复历史数据中颜色图片未迁移的问题
 * 仅管理员可访问
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const SUPABASE_PUBLIC_PATTERN = /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

function isSupabaseStorageUrl(url: string): boolean {
  return !!url && url.includes('supabase.co') && !!url.match(SUPABASE_PUBLIC_PATTERN)
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (!authResult.success) {
    return authResult.response
  }

  const admin = await getSupabaseAdmin()

  try {
    const { data: products, error: fetchError } = await admin
      .from('products')
      .select('id, name, color_options, images')
      .eq('status', 'active')
      .not('color_options', 'is', null)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const results = {
      total: products?.length ?? 0,
      needsMigration: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      details: [] as Array<{
        id: string
        name: string
        status: 'migrated' | 'failed' | 'skipped'
        error?: string
        imagesCount?: number
      }>,
    }

    for (const product of products || []) {
      const colorOptions = (product.color_options ?? []) as Array<{ name: string; image_url: string | null }>
      
      const hasSupabaseImages = colorOptions.some(
        opt => opt.image_url && isSupabaseStorageUrl(opt.image_url)
      )

      if (!hasSupabaseImages) {
        results.skipped++
        results.details.push({
          id: product.id,
          name: product.name,
          status: 'skipped',
        })
        continue
      }

      results.needsMigration++

      try {
        const response = await fetch(`${request.nextUrl.origin}/api/cloudinary/migrate-product-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id }),
        })

        if (response.ok) {
          const data = await response.json()
          results.migrated++
          results.details.push({
            id: product.id,
            name: product.name,
            status: 'migrated',
            imagesCount: data.migrated,
          })
        } else {
          const error = await response.text()
          results.failed++
          results.details.push({
            id: product.id,
            name: product.name,
            status: 'failed',
            error: error.slice(0, 200),
          })
        }
      } catch (e) {
        results.failed++
        results.details.push({
          id: product.id,
          name: product.name,
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        })
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      ok: true,
      summary: results,
    })

  } catch (error) {
    console.error('[fix-color-images-migration] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch migration failed' },
      { status: 500 }
    )
  }
}
