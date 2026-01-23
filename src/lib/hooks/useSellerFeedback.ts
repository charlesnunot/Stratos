import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface CreateFeedbackInput {
  orderId: string
  buyerId: string
  sellerId: string
  shippingTimeRating: number
  productQualityRating: number
  customerServiceRating: number
  comment?: string
}

interface FeedbackStats {
  total_ratings: number
  avg_shipping_time_rating: number | null
  avg_product_quality_rating: number | null
  avg_customer_service_rating: number | null
  total_orders_with_feedback: number
}

// 创建卖家反馈
export function useCreateSellerFeedback() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateFeedbackInput) => {
      const { data, error } = await supabase
        .from('seller_feedbacks')
        .insert({
          order_id: input.orderId,
          buyer_id: input.buyerId,
          seller_id: input.sellerId,
          shipping_time_rating: input.shippingTimeRating,
          product_quality_rating: input.productQualityRating,
          customer_service_rating: input.customerServiceRating,
          comment: input.comment || null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      // 使相关查询失效
      queryClient.invalidateQueries({ queryKey: ['sellerFeedbackStats', data.seller_id] })
      queryClient.invalidateQueries({ queryKey: ['orderFeedback', data.order_id] })
    },
  })
}

// 更新卖家反馈
export function useUpdateSellerFeedback() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      feedbackId,
      ...updates
    }: {
      feedbackId: string
      shippingTimeRating?: number
      productQualityRating?: number
      customerServiceRating?: number
      comment?: string
    }) => {
      // 先获取当前反馈以获取 seller_id
      const { data: currentFeedback } = await supabase
        .from('seller_feedbacks')
        .select('seller_id')
        .eq('id', feedbackId)
        .single()

      const { data, error } = await supabase
        .from('seller_feedbacks')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', feedbackId)
        .select()
        .single()

      if (error) throw error
      return { data, sellerId: currentFeedback?.seller_id }
    },
    onSuccess: (result) => {
      if (result.sellerId) {
        queryClient.invalidateQueries({ queryKey: ['sellerFeedbackStats', result.sellerId] })
      }
    },
  })
}

// 获取卖家反馈统计
export function useSellerFeedbackStats(sellerId: string | undefined) {
  const supabase = createClient()

  return useQuery<FeedbackStats>({
    queryKey: ['sellerFeedbackStats', sellerId],
    queryFn: async () => {
      if (!sellerId) return null as any

      const { data, error } = await supabase
        .from('seller_feedback_stats')
        .select('*')
        .eq('seller_id', sellerId)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 是 "not found" 错误
        throw error
      }

      return (
        data || {
          total_ratings: 0,
          avg_shipping_time_rating: null,
          avg_product_quality_rating: null,
          avg_customer_service_rating: null,
          total_orders_with_feedback: 0,
        }
      )
    },
    enabled: !!sellerId,
  })
}

// 获取订单的反馈
export function useOrderFeedback(orderId: string | undefined, buyerId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orderFeedback', orderId, buyerId],
    queryFn: async () => {
      if (!orderId || !buyerId) return null

      const { data, error } = await supabase
        .from('seller_feedbacks')
        .select('*')
        .eq('order_id', orderId)
        .eq('buyer_id', buyerId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return data || null
    },
    enabled: !!orderId && !!buyerId,
  })
}
