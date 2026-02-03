'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, DollarSign } from 'lucide-react'

export function CommissionManagement() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [settlingId, setSettlingId] = useState<string | null>(null)

  const { data: commissions, isLoading } = useQuery({
    queryKey: ['adminCommissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('affiliate_commissions')
        .select(`
          *,
          affiliate:profiles!affiliate_commissions_affiliate_id_fkey(id, username, display_name),
          order:orders(id, order_number, total_amount, order_status),
          product:products(id, name, images)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data || []
    },
  })

  const handleSettle = async (commissionId: string) => {
    setSettlingId(commissionId)
    try {
      const response = await fetch(`/api/admin/commissions/${commissionId}/settle`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t('commissionSettleFailed'))
      }

      // Refresh commissions list
      queryClient.invalidateQueries({ queryKey: ['adminCommissions'] })
      toast({
        variant: 'success',
        title: tCommon('success'),
        description: t('commissionSettled'),
      })
    } catch (error: any) {
      console.error('Settle commission error:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: `${t('commissionSettleFailed')}: ${error.message}`,
      })
    } finally {
      setSettlingId(null)
    }
  }

  const totalPending = commissions?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('pendingCommissionsTitle')}</h2>
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t('totalLabel')}: ¥{totalPending.toFixed(2)}
          </span>
        </div>
      </div>

      {!commissions || commissions.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t('noPendingCommissions')}</p>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {commissions.map((commission: any) => (
            <div
              key={commission.id}
              className="flex items-center justify-between border-b pb-3 last:border-0"
            >
              <div className="flex items-center gap-3 flex-1">
                {commission.product?.images?.[0] && (
                  <img
                    src={commission.product.images[0]}
                    alt={commission.product.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">
                    {commission.product?.name || t('productDefault')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('affiliateLabel')}: {commission.affiliate?.display_name || commission.affiliate?.username || '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('orderLabel')}: {commission.order?.order_number || '-'} 
                    {commission.order?.order_status && ` (${commission.order.order_status})`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-semibold">¥{commission.amount.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('commissionRateLabel')}: {commission.commission_rate}%
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSettle(commission.id)}
                  disabled={settlingId === commission.id || commission.order?.order_status !== 'completed'}
                  title={
                    commission.order?.order_status !== 'completed'
                      ? t('settleAfterOrderComplete')
                      : t('settle')
                  }
                >
                  {settlingId === commission.id ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      {t('settling')}
                    </>
                  ) : (
                    t('settle')
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
