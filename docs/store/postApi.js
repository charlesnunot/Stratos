// docs/store/postApi.js
import { supabase } from './supabase.js'
import { getUser } from './userManager.js'

// 基础创建帖子函数
export async function createPost({ type, content, images, tags, visibility = 'public', location = null }) {
  const user = getUser()
  if (!user) throw new Error('User not logged in')

  const { data, error } = await supabase
    .from('posts')
    .insert([{
      type,
      content,
      images,                  // ✅ 确保 images 被写入
      tags: tags ? JSON.stringify(tags) : null,
      visibility,
      location,
      author_id: user.id
    }])
    .select()
    .single()

  if (error) throw error
  return data
}

// 创建普通帖子
export async function createNormalPost({ content, tags, visibility, location, images }) {
  return createPost({
    type: 'normal',
    content,
    tags,
    visibility,
    location,
    images // ✅ 透传 images
  })
}

// 创建产品帖子
export async function createProductPost({ title, description, price, stock, shippingfee, link, condition, tags, images }) {
  // 先插入 posts
  const post = await createPost({
    type: 'product',
    content: description,
    tags,
    visibility: 'public',  // 产品默认 public
    images                  // ✅ 保存产品图片到 posts 表
  })

  // 再插入 product_posts
  const { data, error } = await supabase
    .from('product_posts')
    .insert([{
      id: post.id,
      title,
      description,
      price,
      stock,
      shippingfee,
      link,
      condition,
      images
    }])
    .select()
    .single()

  if (error) throw error
  return { post, product: data }
}

/**
 * 获取指定用户的所有帖子
 * @param {string} userId 用户 UUID
 * @param {Object} options 选项，可指定 type: 'normal' | 'product' | null
 * @returns {Promise<Array>} 帖子数组，包含 posts 表的数据，如果是 product 帖子可通过 join 获取 product_posts
 */
export async function getPostsByUser(userId, options = {}) {
  if (!userId) throw new Error('userId is required')

  const { type = null } = options

  // 构建查询
  let query = supabase
    .from('posts')
    .select(`
      *,
      product_posts(*)
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })

  if (type) query = query.eq('type', type)

  const { data, error } = await query

  if (error) throw error
  return data
}

// 获取用户普通帖子
export async function fetchUserPosts(uid, limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', uid)
    .eq('type', 'normal')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchUserPosts error', error)
    return []
  }
  return data ?? []
}

// 获取用户产品帖子
export async function fetchUserProductPosts(uid, limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      product_posts!inner (
        product_id,
        title,
        price,
        stock,
        images,
        description,
        link
      )
    `)
    .eq('author_id', uid)
    .eq('type', 'product')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[API] fetchUserProductPosts error', error)
    return []
  }
  return data ?? []
}

