// docs/store/postApi.js

import { supabase } from './supabase.js'

// 1️⃣ 创建基础帖子（返回 post id）
export async function createPost({ type, content, images, tags, visibility = 'public', location = null }) {
  const { data, error } = await supabase
    .from('posts')
    .insert([{
      type,
      content,
      images,
      tags: tags ? JSON.stringify(tags) : null,
      visibility,
      location,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 2️⃣ 创建普通帖子
export async function createNormalPost({ content, tags, visibility, location }) {
  return createPost({
    type: 'normal',
    content,
    tags,
    visibility,
    location,
  });
}

// 3️⃣ 创建产品帖子
export async function createProductPost({ title, description, price, stock, shippingfee, link, condition, tags, images }) {
  // 先插入 posts
  const post = await createPost({
    type: 'product',
    content: description,
    tags,
    visibility: 'public', // 产品默认 public
  });

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
      images,
    }])
    .select()
    .single();

  if (error) throw error;
  return { post, product: data };
}

