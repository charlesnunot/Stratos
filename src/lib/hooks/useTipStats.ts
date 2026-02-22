import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useTipStats(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['tipStats', userId],
    queryFn: async () => {
      if (!userId) return null

      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      // 收到的打赏总额
      const { data: receivedTips } = await supabase
        .from('tips')
        .select('amount')
        .eq('recipient_id', userId)
        .eq('payment_status', 'completed')

      // 发出的打赏总额
      const { data: givenTips } = await supabase
        .from('tips')
        .select('amount')
        .eq('tipper_id', userId)
        .eq('payment_status', 'completed')

      // 本月收到的打赏
      const { data: receivedThisMonth } = await supabase
        .from('tips')
        .select('amount')
        .eq('recipient_id', userId)
        .eq('payment_status', 'completed')
        .gte('created_at', thisMonth.toISOString())

      // 上月收到的打赏
      const { data: receivedLastMonth } = await supabase
        .from('tips')
        .select('amount')
        .eq('recipient_id', userId)
        .eq('payment_status', 'completed')
        .gte('created_at', lastMonth.toISOString())
        .lt('created_at', thisMonth.toISOString())

      const thisMonthTotal = receivedThisMonth?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0
      const lastMonthTotal = receivedLastMonth?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0
      
      // 计算增长率
      let growthRate = 0
      if (lastMonthTotal > 0) {
        growthRate = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
      }

      return {
        receivedTotal: receivedTips?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0,
        givenTotal: givenTips?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0,
        receivedCount: receivedTips?.length || 0,
        givenCount: givenTips?.length || 0,
        growthRate: parseFloat(growthRate.toFixed(1)), // 新增
        thisMonthTotal,
        lastMonthTotal,
      }
    },
    enabled: !!userId,
    refetchInterval: 60000, // 每分钟刷新一次
  })
}