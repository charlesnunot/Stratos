import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ProductReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ProductReview {
  id: string
  product_id: string
  order_id: string
  user_id: string
  rating: number
  content: string | null
  image_urls: string[] | null
  status: ProductReviewStatus
  created_at: string
  updated_at: string
  profiles?: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
}

export function useProductReviews(productId: string | undefined, opts?: { rating?: number; sort?: 'new' | 'old' }) {
  const supabase = createClient()
  const rating = opts?.rating
  const sort = opts?.sort || 'new'

  return useQuery<ProductReview[]>({
    queryKey: ['productReviews', productId, rating ?? 'all', sort],
    queryFn: async () => {
      if (!productId) return []
      let q = supabase
        .from('product_reviews')
        .select(
          `
          *,
          profiles:profiles!product_reviews_user_id_fkey(id, username, display_name, avatar_url)
        `
        )
        .eq('product_id', productId)

      if (typeof rating === 'number') {
        q = q.eq('rating', rating)
      }

      q = q.order('created_at', { ascending: sort === 'old' })

      const { data, error } = await q
      if (error) throw error
      return (data || []) as unknown as ProductReview[]
    },
    enabled: !!productId,
  })
}

export function useProductReviewStats(productId: string | undefined) {
  const supabase = createClient()

  return useQuery<{
    total: number
    average: number | null
    distribution: Record<number, number>
  }>({
    queryKey: ['productReviewStats', productId],
    queryFn: async () => {
      if (!productId) return { total: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }

      // total/avg via products columns (fast path)
      const { data: productRow, error: productErr } = await supabase
        .from('products')
        .select('review_count, average_rating')
        .eq('id', productId)
        .single()

      if (productErr) throw productErr

      // distribution via grouped query (only approved)
      const { data: distRows, error: distErr } = await supabase
        .from('product_reviews')
        .select('rating, id', { count: 'exact' })
        .eq('product_id', productId)
        .eq('status', 'approved')

      if (distErr) throw distErr

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      for (const r of distRows || []) {
        const k = Number((r as any).rating)
        if (k >= 1 && k <= 5) distribution[k] = (distribution[k] || 0) + 1
      }

      return {
        total: Number((productRow as any)?.review_count || 0),
        average: (productRow as any)?.average_rating ?? null,
        distribution,
      }
    },
    enabled: !!productId,
  })
}

export function useCanReviewProduct(productId: string | undefined, userId: string | undefined) {
  const supabase = createClient()

  return useQuery<{
    canReview: boolean
    orderId: string | null
    reason?: 'not_logged_in' | 'no_eligible_order' | 'already_reviewed'
  }>({
    queryKey: ['canReviewProduct', productId, userId],
    queryFn: async () => {
      if (!productId || !userId) return { canReview: false, orderId: null, reason: 'not_logged_in' }

      // Find an eligible order (shipped/completed)
      const { data: orders, error: orderErr } = await supabase
        .from('orders')
        .select('id')
        .eq('product_id', productId)
        .eq('buyer_id', userId)
        .in('order_status', ['shipped', 'completed'])
        .order('created_at', { ascending: false })
        .limit(20)

      if (orderErr) throw orderErr
      const orderId = orders?.[0]?.id ?? null
      if (!orderId) return { canReview: false, orderId: null, reason: 'no_eligible_order' }

      // Check if already reviewed for that order
      const { data: existing, error: existingErr } = await supabase
        .from('product_reviews')
        .select('id')
        .eq('order_id', orderId)
        .eq('user_id', userId)
        .maybeSingle()

      // maybeSingle may return PGRST116; treat as no existing
      if (existingErr && existingErr.code !== 'PGRST116') throw existingErr
      if (existing?.id) return { canReview: false, orderId, reason: 'already_reviewed' }

      return { canReview: true, orderId }
    },
    enabled: !!productId && !!userId,
  })
}

export function useCreateProductReview() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      productId: string
      orderId: string
      userId: string
      rating: number
      content?: string
      imageUrls?: string[]
    }) => {
      const { data, error } = await supabase
        .from('product_reviews')
        .insert({
          product_id: input.productId,
          order_id: input.orderId,
          user_id: input.userId,
          rating: input.rating,
          content: input.content || null,
          image_urls: input.imageUrls || [],
          status: 'approved',
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['productReviews', data.product_id] })
      queryClient.invalidateQueries({ queryKey: ['productReviewStats', data.product_id] })
      queryClient.invalidateQueries({ queryKey: ['canReviewProduct', data.product_id, data.user_id] })
      queryClient.invalidateQueries({ queryKey: ['product', data.product_id] })
    },
  })
}

