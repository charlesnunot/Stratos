// docs/store/api.js
import { supabase } from './supabase.js'

/**
 * 未登录用户：普通帖子流
 */
export async function fetchDefaultPosts(limit = 20, offset = 0) {
  console.log('[API] fetchDefaultPosts → start', { limit, offset })

  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      type,
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
    .eq('visibility', 'Public')
    .eq('moderation_status', 'approved')
    .eq('type', 'normal')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchDefaultPosts ❌ error', error)
    return []
  }

  console.log('[API] fetchDefaultPosts ← raw data', data)
  console.log('[API] fetchDefaultPosts ← count', data?.length ?? 0)

  // 返回字段映射成前端统一格式
  return (data ?? []).map(p => ({
    ...p,
    author: 'Unknown', // 不依赖作者
    likesCount: p.likes_count ?? 0,
    commentsCount: p.comments_count ?? 0,
    sharesCount: p.shares_count ?? 0,
    favoritesCount: p.favorites_count ?? 0,
    wantsCount: p.wants_count ?? 0,
  }))
}

/**
 * 未登录用户：产品帖子流
 */
export async function fetchDefaultProductPosts(limit = 20, offset = 0) {
  console.log('[API] fetchDefaultProductPosts → start', { limit, offset })

  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      type,
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
    .eq('visibility', 'Public')
    .eq('moderation_status', 'approved')
    .eq('type', 'product')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchDefaultProductPosts ❌ error', error)
    return []
  }

  console.log('[API] fetchDefaultProductPosts ← raw data', data)
  console.log('[API] fetchDefaultProductPosts ← count', data?.length ?? 0)

  // 返回字段映射成前端统一格式
  return (data ?? []).map(p => ({
    ...p,
    author: 'Unknown', // 不依赖作者
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    favoritesCount: 0,
    wantsCount: p.wants_count ?? 0,
  }))
}

/**
 * 未登录用户：默认 Feed（普通 + 产品）
 */
export async function fetchDefaultFeed(limit = 20, offset = 0) {
  console.log('[API] fetchDefaultFeed → start', { limit, offset })

  const [normalPosts, productPosts] = await Promise.all([
    fetchDefaultPosts(limit, offset),
    fetchDefaultProductPosts(limit, offset)
  ])

  console.log('[API] fetchDefaultFeed ← normalPosts', normalPosts)
  console.log('[API] fetchDefaultFeed ← productPosts', productPosts)

  const allPosts = [...normalPosts, ...productPosts].sort((a, b) => {
    const scoreDiff = Number(b.score) - Number(a.score)
    if (scoreDiff !== 0) return scoreDiff
    return new Date(b.created_at) - new Date(a.created_at)
  })

  console.log('[API] fetchDefaultFeed ← merged count', allPosts.length)
  console.log('[API] fetchDefaultFeed ← merged data', allPosts)

  return allPosts
}
