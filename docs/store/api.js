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
  if (!uid) return DEFAULT_AVATAR

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
export async function getUserStats(uid) {
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

/**
 * 上传多张图片到 Cloudinary，并返回成功上传的 URL 数组，同时支持进度回调
 * @param {File[]} files 图片文件数组（来自 input[type="file"]）
 * @param {(percent: number) => void} onProgress 可选回调：0~1，表示整体上传进度
 * @returns {Promise<string[]>} 成功上传的图片 URL 数组
 */
export async function uploadImagesWeb(files, onProgress) {
  if (!files || files.length === 0) return []

  const CLOUDINARY_CLOUD_NAME = 'dpgkgtb5n'
  const CLOUDINARY_UPLOAD_PRESET = 'rn_unsigned'

  const limitedFiles = Array.from(files).slice(0, 4)
  const uploadedUrls = []

  for (let i = 0; i < limitedFiles.length; i++) {
    const file = limitedFiles[i]
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`,
        { method: 'POST', body: formData }
      )
      const result = await res.json()
      if (res.ok && result.secure_url) {
        uploadedUrls.push(result.secure_url)
      }
    } catch (err) {
      console.error('上传图片失败:', err)
    }

    if (onProgress) {
      onProgress((i + 1) / limitedFiles.length)
    }
  }

  return uploadedUrls
}


/**
 * 获取某个用户的粉丝列表（followers）
 * @param {string} uid
 * @returns {Promise<Array<{uid, username, avatar_url}>>}
 */
export async function getUserFollowers(uid) {
  if (!uid) return []

  try {
    const { data, error } = await supabase
      .from('follows')
      .select(`
        follower_id,
        users:auth.users!follows_follower_id_fkey (
          id,
          email
        )
      `)
      .eq('following_id', uid)

    if (error) {
      console.error('[API] getUserFollowers error', error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // 再去 user_profiles / user_avatars 补信息
    const followerIds = data.map(i => i.follower_id)

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('uid, username')
      .in('uid', followerIds)

    const { data: avatars } = await supabase
      .from('user_avatars')
      .select('uid, avatar_url')
      .in('uid', followerIds)

    return followerIds.map(uid => ({
      uid,
      username: profiles?.find(p => p.uid === uid)?.username || 'user',
      avatar_url:
        avatars?.find(a => a.uid === uid)?.avatar_url ||
        'https://via.placeholder.com/40'
    }))
  } catch (err) {
    console.error('[API] getUserFollowers exception', err)
    return []
  }
}

