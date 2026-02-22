import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useTipRecords(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['tipRecords', userId],
    queryFn: async () => {
      if (!userId) return null

      // 获取所有打赏记录（收到的和发出的）
      const { data: received } = await supabase
        .from('tips')
        .select('*, tipper:tipper_id(*), recipient:recipient_id(*)')
        .eq('recipient_id', userId)
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false })

      const { data: given } = await supabase
        .from('tips')
        .select('*, tipper:tipper_id(*), recipient:recipient_id(*)')
        .eq('tipper_id', userId)
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false })

      return {
        received: received || [],
        given: given || [],
      }
    },
    enabled: !!userId,
    refetchInterval: 60000, // 每分钟刷新一次
  })
}