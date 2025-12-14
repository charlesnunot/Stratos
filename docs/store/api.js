import { supabase } from './supabase.js'

/**
 * 未登录用户：普通帖子流
 */
export async function fetchDefaultPosts(limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      type,
      author_id,
      content,
      images,
      tags,
      likes_count,
      comments_count,
      shares_count,
      favorites_count,
      wants_count,
      created_at,
      score
    `)
    .eq('is_deleted', false)
    .eq('visibility', 'Public')              // ✅ 修正大小写
    .eq('moderation_status', 'approved')
    .eq('type', 'normal')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchDefaultPosts error:', error)
    return []
  }

  return data ?? []
}

/**
 * 未登录用户：产品帖子流
 */
export async function fetchDefaultProductPosts(limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      type,
      author_id,
      created_at,
      score,
      wants_count,
      product_posts!inner (
        product_id,
        title,
        price,
        stock,
        images,
        description,
        link,
        wants_count,
        sales_count
      )
    `)
    .eq('is_deleted', false)
    .eq('visibility', 'Public')              // ✅ 修正大小写
    .eq('moderation_status', 'approved')
    .eq('type', 'product')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchDefaultProductPosts error:', error)
    return []
  }

  return data ?? []
}

/**
 * 未登录用户：默认 Feed（普通 + 产品混合）
 */
export async function fetchDefaultFeed(limit = 20, offset = 0) {
  const [normalPosts, productPosts] = await Promise.all([
    fetchDefaultPosts(limit, offset),
    fetchDefaultProductPosts(limit, offset)
  ])

  const allPosts = [...normalPosts, ...productPosts].sort((a, b) => {
    const scoreDiff = Number(b.score) - Number(a.score)
    if (scoreDiff !== 0) return scoreDiff
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return allPosts
}
