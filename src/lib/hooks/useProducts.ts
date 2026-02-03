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
  currency?: string
  images: string[]
  stock: number
  category: string | null
  category_translated?: string | null
  allow_affiliate: boolean
  commission_rate: number | null
  status: string
  like_count?: number
  want_count?: number
  share_count?: number
  favorite_count?: number
  sales_count?: number
  created_at: string
  updated_at: string
  seller?: {
    username: string
    display_name: string
    avatar_url: string | null
  }
}

const PRODUCTS_PER_PAGE = 20

const PRODUCT_SELECT = `
  *,
  seller:profiles!products_seller_id_fkey (
    username,
    display_name,
    avatar_url
  )
`

function mapRowToProduct(row: any): Product {
  return {
    ...row,
    like_count: row.like_count || 0,
    want_count: row.want_count || 0,
    share_count: row.share_count || 0,
    favorite_count: row.favorite_count || 0,
    sales_count: row.sales_count || 0,
    currency: row.currency || 'USD',
    seller: row.seller
      ? {
          username: row.seller.username || '',
          display_name: row.seller.display_name || '',
          avatar_url: row.seller.avatar_url || null,
        }
      : undefined,
  }
}

/** 个性化商品 Feed：调用 RPC 取有序 product_id，再拉取完整商品并保持顺序。RPC 失败（如未部署或 400）时回退到普通列表。 */
async function fetchProductFeed(
  userId: string,
  page: number,
  category?: string
): Promise<Product[]> {
  const supabase = createClient()
  const offset = page * PRODUCTS_PER_PAGE

  const { data: rows, error: rpcError } = await supabase.rpc('get_personalized_product_feed', {
    p_user_id: userId,
    p_limit: PRODUCTS_PER_PAGE,
    p_offset: offset,
    p_exclude_viewed_days: 7,
    p_tier1_base: 100,
    p_tier2_base: 50,
    p_diversity_n: 30,
    p_diversity_k: 2,
    p_category: category || null,
    p_category_interaction_min: 8,
  })

  if (rpcError) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[useProducts] get_personalized_product_feed RPC failed, falling back to regular list:', rpcError.message)
    }
    return fetchProducts(page, category)
  }
  const ids = (rows || []).map((r: { product_id: string }) => r.product_id).filter(Boolean)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .in('id', ids)

  if (error) throw error

  const byId = new Map((data || []).map((p: any) => [p.id, mapRowToProduct(p)]))
  return ids.map((id: string) => byId.get(id)).filter(Boolean) as Product[]
}

async function fetchProducts(page: number = 0, category?: string) {
  const supabase = createClient()

  const from = page * PRODUCTS_PER_PAGE
  const to = from + PRODUCTS_PER_PAGE - 1

  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(mapRowToProduct)
}

export function useProducts(category?: string, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ['products', 'active', category],
    queryFn: ({ pageParam = 0 }) => fetchProducts(pageParam, category),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PRODUCTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: options?.enabled !== false,
    staleTime: 60_000,
  })
}

/** 已登录用户：个性化商品推荐流（Tier1 关注卖家 / Tier2 互动分类 / Tier3 其余） */
export function useProductFeed(
  userId: string | undefined,
  category?: string,
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery({
    queryKey: ['productFeed', userId, category],
    queryFn: ({ pageParam = 0 }) => fetchProductFeed(userId!, pageParam, category),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PRODUCTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: (options?.enabled !== false) && !!userId,
    staleTime: 60_000,
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
        .select(PRODUCT_SELECT)
        .eq('seller_id', sellerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error
      return (data || []).map(mapRowToProduct)
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PRODUCTS_PER_PAGE) return undefined
      return allPages.length
    },
    initialPageParam: 0,
    enabled: !!sellerId,
  })
}
