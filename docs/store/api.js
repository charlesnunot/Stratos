// docs/store/api.js
import { supabase } from './supabase.js'

const DEFAULT_AVATAR =
  'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg'


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
    // 用 ilike 放宽大小写匹配
    .ilike('visibility', 'public')
    .ilike('moderation_status', 'approved')
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

  return data ?? []
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
    .ilike('visibility', 'public')
    .ilike('moderation_status', 'approved')
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

  return data ?? []
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

/**
 * 获取用户头像（未登录 / 已登录通用）
 */
export async function getUserAvatar(uid) {
  if (!uid) {
    return DEFAULT_AVATAR
  }

  try {
    const { data, error } = await supabase
      .from('user_avatars')
      .select('avatar_url')
      .eq('uid', uid)
      .single()

    if (error || !data?.avatar_url) {
      console.warn('[API] getUserAvatar fallback', { uid, error })
      return DEFAULT_AVATAR
    }

    return data.avatar_url
  } catch (err) {
    console.error('[API] getUserAvatar ❌ error', err)
    return DEFAULT_AVATAR
  }
}

/**
 * 获取用户 Profile（user_profiles）
 */
export async function getUserProfile(uid) {
  if (!uid) return null

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('uid', uid)
      .maybeSingle()

    if (error) {
      console.error('[API] getUserProfile ❌ error', error)
      return null
    }

    return data
  } catch (err) {
    console.error('[API] getUserProfile ❌ exception', err)
    return null
  }
}

/**
 * 获取用户统计信息：关注、粉丝、获赞
 */
export async function getUserStats(uid: string) {
  if (!uid) return null

  try {
    // 关注数
    const { count: following_count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', uid)

    // 粉丝数
    const { count: followers_count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', uid)

    // 获赞数
    const { data: likesData, error: likesError } = await supabase
      .from('user_likes')
      .select('id')
      .eq('user_id', uid)

    if (likesError) {
      console.error('获取用户获赞失败', likesError)
      return null
    }

    const likes_count = likesData?.length || 0

    return {
      followers_count: followers_count || 0,
      following_count: following_count || 0,
      likes_count
    }
  } catch (err) {
    console.error('获取用户统计异常', err)
    return null
  }
}


