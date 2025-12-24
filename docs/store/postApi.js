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
