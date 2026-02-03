import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ProductCommentStatus = 'pending' | 'approved' | 'rejected'

export interface ProductComment {
  id: string
  product_id: string
  user_id: string
  content: string
  content_lang?: 'zh' | 'en' | null
  content_translated?: string | null
  parent_id: string | null
  image_urls: string[] | null
  status: ProductCommentStatus
  created_at: string
  profiles?: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
}

export function useProductComments(productId: string | undefined) {
  const supabase = createClient()

  return useQuery<ProductComment[]>({
    queryKey: ['productComments', productId],
    queryFn: async () => {
      if (!productId) return []
      const { data, error } = await supabase
        .from('product_comments')
        .select(
          `
          *,
          profiles:profiles!product_comments_user_id_fkey(id, username, display_name, avatar_url)
        `
        )
        .eq('product_id', productId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data || []) as unknown as ProductComment[]
    },
    enabled: !!productId,
  })
}

export function useCreateProductComment() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      productId: string
      userId: string
      content: string
      parentId?: string | null
      imageUrls?: string[]
      status?: 'pending' | 'approved'
    }) => {
      const { data, error } = await supabase
        .from('product_comments')
        .insert({
          product_id: input.productId,
          user_id: input.userId,
          content: input.content,
          parent_id: input.parentId || null,
          image_urls: input.imageUrls || [],
          status: input.status ?? 'pending',
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['productComments', data.product_id] })
    },
  })
}

export function useUpdateProductComment() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { commentId: string; productId: string; content: string; imageUrls?: string[] }) => {
      const { data, error } = await supabase
        .from('product_comments')
        .update({
          content: input.content,
          image_urls: input.imageUrls || [],
        })
        .eq('id', input.commentId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['productComments', variables.productId] })
    },
  })
}

export function useDeleteProductComment() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { commentId: string; productId: string }) => {
      const { error } = await supabase.from('product_comments').delete().eq('id', input.commentId)
      if (error) throw error
      return true
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['productComments', variables.productId] })
    },
  })
}

