'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface Product {
  id: string
  seller_id: string
  name: string
  description: string | null
  details?: string | null
  faq?: Array<{ question: string; answer: string }> | null
  price: number
  images: string[]
  stock: number
  category: string | null
  allow_affiliate: boolean
  commission_rate: number | null
  status: string
  like_count?: number
  want_count?: number
  share_count?: number
  favorite_count?: number
  created_at: string
  updated_at: string
  seller?: {
    username: string
    display_name: string
    avatar_url: string | null
  }
}

const PRODUCTS_PER_PAGE = 20

async function fetchProducts(page: number = 0, category?: string) {
  const supabase = createClient()
  
  const from = page * PRODUCTS_PER_PAGE
  const to = from + PRODUCTS_PER_PAGE - 1

  let query = supabase
    .from('products')
    .select(`
      *,
      seller:profiles!products_seller_id_fkey (
        username,
        display_name,
        avatar_url
      )
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, to)

  // 如果指定了分类，添加分类筛选
  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) throw error

  // Transform the data to match our Product interface
  const products: Product[] = (data || []).map((product: any) => ({
    ...product,
    like_count: product.like_count || 0,
    want_count: product.want_count || 0,
    share_count: product.share_count || 0,
    favorite_count: product.favorite_count || 0,
    seller: product.seller ? {
      username: product.seller.username || '',
      display_name: product.seller.display_name || '',
      avatar_url: product.seller.avatar_url || null,
    } : undefined,
  }))

  return products
}

export function useProducts(category?: string) {
  return useInfiniteQuery({
    queryKey: ['products', 'active', category],
    queryFn: ({ pageParam = 0 }) => fetchProducts(pageParam, category),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PRODUCTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
  })
}

/**
 * 获取指定用户的商品列表
 */
export function useUserProducts(sellerId: string) {
  return useInfiniteQuery({
    queryKey: ['userProducts', sellerId],
    queryFn: async ({ pageParam = 0 }) => {
      const supabase = createClient()
      
      const from = pageParam * PRODUCTS_PER_PAGE
      const to = from + PRODUCTS_PER_PAGE - 1

      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          seller:profiles!products_seller_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('seller_id', sellerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      // Transform the data
      const products: Product[] = (data || []).map((product: any) => ({
        ...product,
        like_count: product.like_count || 0,
        want_count: product.want_count || 0,
        share_count: product.share_count || 0,
        favorite_count: product.favorite_count || 0,
        seller: product.seller ? {
          username: product.seller.username || '',
          display_name: product.seller.display_name || '',
          avatar_url: product.seller.avatar_url || null,
        } : undefined,
      }))

      return products
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PRODUCTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: !!sellerId,
  })
}
