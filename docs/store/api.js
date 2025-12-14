// docs/store/api.js
import { supabase } from './supabase.js'

/**
 * 获取未登录用户默认普通帖子流
 * @param {number} limit 拉取数量
 * @param {number} offset 偏移量
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
      created_at,
      score
    `)
    .eq('is_deleted', false)
    .eq('visibility', 'public')
    .eq('moderation_status', 'approved')
    .in('type', ['normal'])
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchDefaultPosts error:', error)
    return []
  }
  return data || []
}

/**
 * 获取未登录用户默认产品帖子流
 * @param {number} limit 拉取数量
 * @param {number} offset 偏移量
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
      product_posts(
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
    .eq('visibility', 'public')
    .eq('moderation_status', 'approved')
    .eq('type', 'product')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchDefaultProductPosts error:', error)
    return []
  }
  return data || []
}

/**
 * 获取未登录用户的默认帖子流（普通+产品合并）
 * @param {number} limit 每类拉取数量
 * @param {number} offset 偏移量
 */
export async function fetchDefaultFeed(limit = 20, offset = 0) {
  const [normalPosts, productPosts] = await Promise.all([
    fetchDefaultPosts(limit, offset),
    fetchDefaultProductPosts(limit, offset)
  ])

  // 合并帖子流，并按 score + created_at 排序
  const allPosts = [...normalPosts, ...productPosts].sort(
    (a, b) => b.score - a.score || new Date(b.created_at) - new Date(a.created_at)
  )

  return allPosts
}
