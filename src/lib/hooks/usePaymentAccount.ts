'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { PayoutEligibility, PaymentAccountStatus } from '@/components/payment/PaymentAccountBanner'

export { PayoutEligibility }
export type { PaymentAccountStatus }

export function usePaymentAccount(userId: string | undefined) {
  return useQuery({
    queryKey: ['paymentAccount', userId],
    queryFn: async (): Promise<PaymentAccountStatus | null> => {
      if (!userId) return null

      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          payment_provider,
          payment_account_id,
          seller_payout_eligibility
        `)
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Failed to fetch payment account:', error)
        throw error
      }

      return {
        hasPaymentAccount: !!(data.payment_provider && data.payment_account_id),
        paymentProvider: data.payment_provider,
        eligibility: data.seller_payout_eligibility as PayoutEligibility | null,
        shouldShowBanner: true,
      }
    },
    enabled: !!userId,
  })
}